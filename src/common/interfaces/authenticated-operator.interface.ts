import { RoleName } from '../constants/roles';

/** Runtime class so emitDecoratorMetadata works with isolatedModules. */
export class AuthenticatedOperator {
  id!: string;
  email!: string;
  name!: string;
  roles!: RoleName[];
}
