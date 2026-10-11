import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Session } from '../interfaces/session.interface';

/**
 * InMemorySessionsRepository — temporary development storage.
 *
 * Holds active mock sessions keyed by token. AuthGuard reads from this on
 * every authenticated request; AuthService writes to it on login and
 * removes from it on logout. All sessions are lost on server restart —
 * acceptable for this phase since there is no real auth/database yet.
 */
@Injectable()
export class InMemorySessionsRepository {
  private readonly sessions = new Map<string, Session>();

  create(payload: Omit<Session, 'token' | 'issuedAt'>): Session {
    const session: Session = {
      ...payload,
      token: randomBytes(24).toString('hex'),
      issuedAt: new Date().toISOString(),
    };
    this.sessions.set(session.token, session);
    return session;
  }

  findByToken(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }
}
