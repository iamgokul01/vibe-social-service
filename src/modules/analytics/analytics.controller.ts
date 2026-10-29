import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../rbac/roles';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Permissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Headline metrics with period over period deltas' })
  summary(@Query('range') range?: string) {
    return this.analyticsService.summary(range ?? '30d');
  }

  @Get('timeseries')
  @Permissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Daily views and likes across the selected window' })
  timeseries(@Query('range') range?: string) {
    return this.analyticsService.timeseries(range ?? '30d');
  }

  @Get('by-role')
  @Permissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Engagement share per access level' })
  byRole(@Query('range') range?: string) {
    return this.analyticsService.byRole(range ?? '30d');
  }

  @Get('top-posts')
  @Permissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Ranked publications by engagement index' })
  topPosts(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.topPosts(query);
  }

  @Get('topics')
  @Permissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Topic volume across the selected window' })
  topics(@Query('range') range?: string) {
    return this.analyticsService.topics(range ?? '30d');
  }

  @Get('export.csv')
  @Permissions(Permission.ANALYTICS_EXPORT)
  @ApiOperation({ summary: 'Stream the ranked publication report as CSV' })
  async export(
    @Query('range') range: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.analyticsService.exportCsv(range ?? '30d');

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="vibesocial-analytics.csv"');
    response.send(csv);
  }
}
