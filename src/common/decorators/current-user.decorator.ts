import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedOperator } from '../interfaces/authenticated-operator.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedOperator => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedOperator }>();
    return request.user;
  },
);
