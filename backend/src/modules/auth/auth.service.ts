import { AppError } from '../../shared/errors/AppError';
import { signToken } from '../../shared/utils/jwt';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import { toPublicUser, verifyPassword, type PublicUser } from '../users/users.service';
import type { LoginInput } from './auth.schemas';

export type LoginResult = {
  token: string;
  user: PublicUser;
};

export function createAuthService(repository: UsersRepository = usersRepository) {
  return {
    async login({ email, password }: LoginInput): Promise<LoginResult> {
      const user = await repository.findByEmail(email);

      // Resposta idêntica para e-mail inexistente e senha errada: distingui-las
      // permitiria enumerar quem tem conta.
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new AppError('Credenciais inválidas.', 401, 'INVALID_CREDENTIALS');
      }

      return {
        token: signToken({ sub: user.id, role: user.role }),
        user: toPublicUser(user),
      };
    },

    async me(userId: string): Promise<PublicUser> {
      const user = await repository.findById(userId);

      if (!user) {
        throw new AppError('Usuário não encontrado.', 401, 'USER_NOT_FOUND');
      }

      return toPublicUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

export const authService = createAuthService();
