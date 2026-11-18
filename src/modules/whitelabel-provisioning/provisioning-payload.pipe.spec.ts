import { BadRequestException } from '@nestjs/common';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { RetryProvisioningDto } from './dto/retry-provisioning.dto';
import { ProvisioningPayloadPipe } from './provisioning-payload.pipe';

const base = {
  name: 'Acme Capital',
  slug: 'acme-capital',
  baseUrl: 'https://acme-capital.wallet.loor.vc',
};

describe('ProvisioningPayloadPipe', () => {
  const pipe = new ProvisioningPayloadPipe(CreateProvisioningDto);

  it('accepts a plain JSON body with branding', async () => {
    const dto = await pipe.transform({
      ...base,
      branding: {
        email: { primary_color: '#aabbcc', logo_url: null },
        loginBrandPanelTextColor: '#ffffff',
        mainArea: { pages: ['login', 'register'] },
      },
    });
    expect(dto).toBeInstanceOf(CreateProvisioningDto);
    expect(dto.branding?.email?.logo_url).toBeNull();
    expect(dto.branding?.mainArea?.pages).toEqual(['login', 'register']);
  });

  it('accepts multipart: DTO as JSON string in `payload`', async () => {
    const dto = await pipe.transform({
      payload: JSON.stringify({
        ...base,
        branding: { mainArea: { pages: ['quick_profile'] } },
      }),
    });
    expect(dto.slug).toBe('acme-capital');
    expect(dto.branding?.mainArea?.pages).toEqual(['quick_profile']);
  });

  it.each([
    [{ email: { primary_color: 'red' } }],
    [{ email: { primary_color: '#abc' } }],
    [{ email: { logo_url: 'ftp://x.example/logo.png' } }],
    [{ email: { logo_url: 'https://user:pw@x.example/logo.png' } }],
    [{ loginBrandPanelTextColor: 'white' }],
    [{ mainArea: { pages: ['dashboard'] } }],
    [{ mainArea: { pages: ['login', 'login'] } }],
    [{ unknownKey: true }],
  ])('rejects invalid branding %j', async (branding) => {
    await expect(pipe.transform({ ...base, branding })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a malformed payload string', async () => {
    await expect(pipe.transform({ payload: '{nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('retry DTO: empty body is fine, branding is validated', async () => {
    const retry = new ProvisioningPayloadPipe(RetryProvisioningDto);
    await expect(retry.transform(undefined)).resolves.toBeInstanceOf(
      RetryProvisioningDto,
    );
    await expect(
      retry.transform({ branding: { loginBrandPanelTextColor: '#000000' } }),
    ).resolves.toBeDefined();
    await expect(
      retry.transform({ branding: { loginBrandPanelTextColor: 'nope' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
