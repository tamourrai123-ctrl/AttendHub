import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiLog } from '../interfaces/api-log.interface';

const MAX_ENTRIES = 500;

/**
 * InMemoryMonitoringRepository — temporary development storage, capped at
 * MAX_ENTRIES (newest first) so a long-running dev server doesn't grow this
 * unbounded. No Elasticsearch or other external logging infrastructure —
 * see Phase 4B section 22.
 */
@Injectable()
export class InMemoryMonitoringRepository {
  private readonly entries: ApiLog[] = [];

  record(entry: Omit<ApiLog, 'id' | 'requestId' | 'timestamp'>): ApiLog {
    const log: ApiLog = {
      id: `applog_${randomUUID()}`,
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.entries.unshift(log);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
    return log;
  }

  findAll(): ApiLog[] {
    return this.entries;
  }
}
