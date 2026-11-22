import type { User } from '../database/schema.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}
