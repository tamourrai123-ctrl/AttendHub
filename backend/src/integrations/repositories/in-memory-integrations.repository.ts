import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Integration } from '../interfaces/integration.interface';
import { CreateIntegrationDto } from '../dto/create-integration.dto';
import { UpdateIntegrationDto } from '../dto/update-integration.dto';

/**
 * InMemoryIntegrationsRepository — superseded by PrismaIntegrationsRepository
 * (see integrations.module.ts, which no longer provides this class) and no
 * longer instantiated anywhere in the running application. Left on disk for
 * reference only, the same way InMemoryCompaniesRepository was left after
 * the Companies migration.
 *
 * Its seed data and create()/update() bodies were updated to match the
 * current Integration / CreateIntegrationDto / UpdateIntegrationDto shapes
 * (see the Integrations migration report) purely so this otherwise-dead
 * file keeps compiling as part of `nest build` — it has no effect on the
 * real API, which is served entirely by PrismaIntegrationsRepository.
 *
 * create()'s signature was updated again for the RBAC revision that moved
 * companyId off CreateIntegrationDto and onto its own parameter (matching
 * PrismaIntegrationsRepository.create()) — purely a compile-only fixup,
 * same as above.
 */
@Injectable()
export class InMemoryIntegrationsRepository {
  private integrations: Integration[] = [
    {
      id: 'int_001',
      companyId: 'cmp_001',
      companyName: 'ABC Pvt Ltd',
      integrationType: 'HRS',
      authType: 'KEY',
      status: 'CONNECTED',
      baseUrl: 'https://api.bamboohr.com/abc',
      credentialsConfigured: true,
    },
    {
      id: 'int_002',
      companyId: 'cmp_002',
      companyName: 'XYZ Ltd',
      integrationType: 'HRS',
      authType: 'OAU',
      status: 'DISCONNECTED',
      baseUrl: 'https://api.workday.com/xyz',
      credentialsConfigured: true,
    },
  ];

  findAll(): Integration[] {
    return this.integrations;
  }

  findById(id: string): Integration | undefined {
    return this.integrations.find((integration) => integration.id === id);
  }

  create(companyId: string, dto: CreateIntegrationDto, companyName: string): Integration {
    const integration: Integration = {
      id: `int_${randomUUID().slice(0, 8)}`,
      companyId,
      companyName,
      integrationType: dto.integrationType,
      authType: dto.authType,
      status: 'CONNECTED',
      baseUrl: dto.baseUrl,
      credentialsConfigured: true,
    };
    this.integrations.push(integration);
    return integration;
  }

  update(id: string, dto: UpdateIntegrationDto): Integration | undefined {
    const integration = this.findById(id);
    if (!integration) return undefined;
    Object.assign(integration, dto);
    return integration;
  }

  remove(id: string): boolean {
    const lengthBefore = this.integrations.length;
    this.integrations = this.integrations.filter((integration) => integration.id !== id);
    return this.integrations.length < lengthBefore;
  }
}
