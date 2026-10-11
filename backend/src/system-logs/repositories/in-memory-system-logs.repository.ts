import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RecordSystemLogInput, SystemLogEntry } from '../interfaces/system-log-entry.interface';

const MAX_ENTRIES = 500;

/**
 * InMemorySystemLogsRepository — temporary development storage.
 *
 * Newest first, capped at MAX_ENTRIES so this can't grow unbounded during a
 * long-running dev server. A real database phase replaces this with an
 * append-only, queryable system_logs table.
 */
@Injectable()
export class InMemorySystemLogsRepository {
  private readonly entries: SystemLogEntry[] = [];

  add(input: RecordSystemLogInput): SystemLogEntry {
    const entry: SystemLogEntry = {
      id: `syslog_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      severity: input.severity ?? 'INFO',
      ...input,
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
    return entry;
  }

  findAll(): SystemLogEntry[] {
    return this.entries;
  }

  findById(id: string): SystemLogEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }
}
