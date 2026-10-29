import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const ANALYTICS_RANGES = ['today', '7d', '30d', '90d'] as const;
export type AnalyticsRangeQuery = (typeof ANALYTICS_RANGES)[number];

export class AnalyticsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(ANALYTICS_RANGES)
  @Type(() => String)
  range: AnalyticsRangeQuery = '30d';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsIn(['views', 'likes', 'engagement'])
  @Type(() => String)
  sort: 'views' | 'likes' | 'engagement' = 'engagement';
}
