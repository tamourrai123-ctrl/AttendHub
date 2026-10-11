import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LovOption {
  value: string;
  title: string;
  sorting: number;
}

/**
 * Reads LOV (list-of-values) groups from the real app_lov_master /
 * app_lov_detail tables via Prisma's existing typed models — see
 * src/lov/constants/lov-groups.constant.ts for how this maps onto the
 * inspected lov_vu view and why a group can legitimately have zero rows
 * right now.
 *
 * This is the ONLY place in the codebase that should query
 * app_lov_master/app_lov_detail for validating or listing LOV-driven codes
 * (e.g. integration auth types). Nothing here hardcodes a fallback list of
 * "valid" values — an unseeded/empty group means getActiveOptions()
 * correctly returns [] and isValidValue() correctly returns false, so
 * callers must handle "not configured yet" as a real, reportable state
 * rather than something silently papered over.
 */
@Injectable()
export class LovService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active (`status = 'Y'`) options for a named LOV group, ordered by
   * app_lov_detail.sorting. Returns [] both when the group doesn't exist at
   * all and when it exists but has no active rows — callers that need to
   * distinguish "misconfigured" from "no options yet" should treat both the
   * same way (there is nothing valid to accept either way).
   */
  async getActiveOptions(groupTitle: string): Promise<LovOption[]> {
    const master = await this.prisma.app_lov_master.findFirst({
      where: { title: groupTitle },
      include: {
        app_lov_detail: {
          where: { status: 'Y' },
          orderBy: { sorting: 'asc' },
        },
      },
    });

    if (!master) {
      return [];
    }

    return master.app_lov_detail.map((detail) => ({
      value: detail.return,
      title: detail.display,
      sorting: Number(detail.sorting ?? 0),
    }));
  }

  /** Whether `value` is an active option of the named LOV group right now. */
  async isValidValue(groupTitle: string, value: string): Promise<boolean> {
    const options = await this.getActiveOptions(groupTitle);
    return options.some((option) => option.value === value);
  }
}
