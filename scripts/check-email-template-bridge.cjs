/* Source behavioral checks with dependency adapters. Does not replace Nest/Jest
 * HTTP validation tests. No app bootstrap, database, network or environment file.
 * EMAIL_BRIDGE_TYPESCRIPT_PATH may point to an already installed TypeScript when
 * this checkout's dependency installation is unavailable. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require(process.env.EMAIL_BRIDGE_TYPESCRIPT_PATH || 'typescript')
const root = path.resolve(__dirname, '..')
const metadata = new Map()
const logs = []
const noopDecorator = () => () => {}
class ValidationError extends Error {}
const common = {
  Injectable: noopDecorator,
  Controller: noopDecorator,
  Body: noopDecorator,
  Delete: noopDecorator,
  Get: noopDecorator,
  Post: noopDecorator,
  Patch: noopDecorator,
  Query: noopDecorator,
  Req: noopDecorator,
  Param: noopDecorator,
  HttpCode: noopDecorator,
  BadRequestException: ValidationError,
  ForbiddenException: ValidationError,
  Logger: class { error (value) { logs.push(value) } },
  SetMetadata: (key, value) => (_target, _name, descriptor) => {
    const fn = descriptor?.value || _target
    metadata.set(fn, { ...metadata.get(fn), [key]: value })
  },
}
const modules = {
  '@nestjs/common': common,
  '@nestjs/swagger': { ApiBearerAuth: noopDecorator, ApiOperation: noopDecorator, ApiTags: noopDecorator },
  '../../common/decorators/current-user.decorator': { CurrentUser: noopDecorator },
}
function load (file, adapters = {}) {
  const filename = path.resolve(root, file)
  const source = fs.readFileSync(filename, 'utf8')
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: true } })
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, `Syntax diagnostics in ${file}`)
  const mod = { exports: {} }
  const requireSource = name => {
    if (name in adapters) return adapters[name]
    if (name in modules) return modules[name]
    throw new Error(`Unexpected dependency: ${name}`)
  }
  vm.runInNewContext(result.outputText, { module: mod, exports: mod.exports, require: requireSource, console }, { filename })
  return mod.exports
}
modules['../../common/constants/roles'] = load('src/common/constants/roles.ts')
const roleDecorator = load('src/common/decorators/roles.decorator.ts', { '../constants/roles': modules['../../common/constants/roles'] })
modules['../../common/decorators/roles.decorator'] = roleDecorator
const { EmailTemplatesService } = load('src/modules/email-templates/email-templates.service.ts')
const { EmailTemplatesController } = load('src/modules/email-templates/email-templates.controller.ts')
const { RolesGuard } = load('src/common/guards/roles.guard.ts', { '../decorators/roles.decorator': roleDecorator, '../constants/roles': modules['../../common/constants/roles'] })
const plain = value => JSON.parse(JSON.stringify(value))
let requests = []
let audits = []
let coreError = null
let auditError = null
const service = new EmailTemplatesService({ request: async options => { requests.push(plain(options)); if (coreError) throw coreError; return { status: 200, data: { data: { id: 33 } } } } }, { write: async data => { audits.push(plain(data)); if (auditError) throw auditError } })
const meta = { operatorId: 'operator', correlationId: 'qa' }
const body = { name: 'QA', type: 'email_confirmation', subject: 'PRIVATE SUBJECT', body_html: '<p>PRIVATE BODY {{url}}</p>' }
let passed = 0
async function test (name, fn) { requests = []; audits = []; coreError = null; auditError = null; logs.length = 0; await fn(); passed++; console.log(`PASS ${name}`) }
;(async () => {
  await test('selected tenant and template IDs become canonical internal Core paths', async () => {
    assert.deepEqual(plain(await service.list('8', body.type, 'qa')), { data: { id: 33 } })
    assert.deepEqual(requests[0], { method: 'GET', path: '/internal/super-admin/v1/whitelabels/8/emails/templates', query: { type: body.type }, correlationId: 'qa' })
    await service.show('8', '33')
    assert.equal(requests[1].path, '/internal/super-admin/v1/whitelabels/8/emails/templates/33')
    assert.equal(audits.length, 0)
  })
  await test('invalid canonical IDs are rejected before Core access', async () => {
    for (const id of ['0', '-1', '08', '1e3', '8/../9', '9007199254740992']) {
      await assert.rejects(service.list(id), /Invalid numeric identifier/)
      await assert.rejects(service.show('8', id), /Invalid numeric identifier/)
    }
    assert.equal(requests.length, 0)
  })
  await test('preview is one pure Core request with no caller variables or recipients', async () => {
    const preview = { type: body.type, subject: body.subject, body_html: body.body_html }
    await service.preview('8', preview, 'qa')
    assert.deepEqual(requests[0], { method: 'POST', path: '/internal/super-admin/v1/whitelabels/8/emails/templates/preview', body: preview, correlationId: 'qa' })
    for (const extra of [{ to: 'someone@example.invalid' }, { variables: { token: 'secret' } }]) await assert.rejects(service.preview('8', { ...preview, ...extra }), /Invalid template payload/)
    assert.equal(requests.length, 1)
    assert.equal(audits.length, 0)
  })
  await test('successful create records returned ID without editorial or credential material', async () => {
    await service.mutate('8', 'POST', body, meta)
    assert.equal(requests.length, 1)
    assert.equal(audits[0].resourceId, 33)
    assert.equal(audits[0].afterData.templateId, 33)
    assert.equal(audits[0].superAdminId, 'operator')
    assert.equal(audits[0].whitelabelId, 8)
    assert.doesNotMatch(JSON.stringify(audits), /PRIVATE|\{\{url\}\}/)
  })
  await test('uncertain writes are not retried, and failed audit cannot replay success', async () => {
    coreError = new Error('timeout')
    await assert.rejects(service.mutate('8', 'POST', body, meta), /timeout/)
    assert.equal(requests.length, 1)
    assert.equal(audits[0].result, 'failed')
    coreError = null
    auditError = new Error('audit unavailable SECRET')
    await service.mutate('8', 'PATCH', { name: 'QA edit' }, meta, '33')
    assert.equal(requests.length, 2)
    assert.equal(audits[1].result, 'success')
    assert.doesNotMatch(JSON.stringify(logs), /SECRET/)
  })
  await test('delete carries no body, and mutations cannot retarget tenant or type', async () => {
    await service.mutate('8', 'DELETE', {}, meta, '33')
    assert.equal('body' in requests[0], false)
    await assert.rejects(service.mutate('8', 'PATCH', { wtlb_id: 9 }, meta, '33'))
    await assert.rejects(service.mutate('8', 'PATCH', { type: 'password_recovery' }, meta, '33'))
    assert.equal(requests.length, 1)
  })
  await test('audit ignores unset optional DTO fields', async () => {
    await service.mutate('8', 'PATCH', { name: 'QA edit', subject: undefined, body_html: undefined, active: undefined }, meta, '33')
    assert.deepEqual(audits[0].afterData.changedFields, ['name'])
  })
  await test('actual controller role declarations preserve read-only preview and operator-only mutations', () => {
    const guard = new RolesGuard({ getAllAndOverride: (key, [handler]) => metadata.get(handler)?.[key] })
    const context = (method, roles) => ({ getHandler: () => EmailTemplatesController.prototype[method], getClass: () => EmailTemplatesController, switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }) })
    for (const method of ['types', 'list', 'show', 'preview']) assert.equal(guard.canActivate(context(method, ['READ_ONLY'])), true)
    for (const method of ['create', 'update', 'remove']) {
      assert.equal(guard.canActivate(context(method, ['SUPER_ADMIN'])), true)
      assert.throws(() => guard.canActivate(context(method, ['READ_ONLY'])), /Insufficient role/)
      assert.throws(() => guard.canActivate(context(method, ['SUPPORT'])), /Insufficient role/)
    }
    assert.throws(() => guard.canActivate(context('preview')), /Missing operator context/)
  })
  console.log(`${passed} focused Nest source checks passed. Actual Nest HTTP/DTO/Jest checks remain separate.`)
})().catch(error => { console.error(error); process.exitCode = 1 })
