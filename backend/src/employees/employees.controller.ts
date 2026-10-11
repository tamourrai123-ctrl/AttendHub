import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

/**
 * Company Admin only — unchanged from before this migration; no routes
 * were added for Super Admin here (see the Employees migration report's
 * blockers section on this exact point). Every method derives companyId
 * from the authenticated user (@CurrentUser()) — an id supplied in the URL
 * or body is never trusted for scoping, only for identifying which record
 * within the caller's own company is being acted on.
 */
@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@Roles(Role.COMPANY_ADMIN)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  private requireCompanyId(user: AuthenticatedUser): string {
    if (!user.companyId) {
      throw new BadRequestException('This account is not associated with a company.');
    }
    return user.companyId;
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated Company Admin's own employees." })
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEmployeesDto) {
    const companyId = this.requireCompanyId(user);
    return ok(await this.employeesService.findAllForCompany(companyId, query));
  }

  @Get(':id')
  @ApiOperation({ summary: "Get one employee by id, scoped to the caller's own company." })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompanyId(user);
    return ok(await this.employeesService.findOneForCompany(id, companyId));
  }

  @Post()
  @ApiOperation({ summary: "Create an employee under the caller's own company." })
  async create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompanyId(user);
    return ok(await this.employeesService.create(dto, companyId, this.actorName(user)));
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update an employee, scoped to the caller's own company." })
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompanyId(user);
    return ok(await this.employeesService.update(id, companyId, dto, this.actorName(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an employee, scoped to the caller's own company." })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompanyId(user);
    await this.employeesService.remove(id, companyId, this.actorName(user));
    return okMessage('Employee deleted successfully.');
  }
}
