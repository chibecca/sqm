import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import {
  ParameterSelection,
  ParameterSelectionSchema,
  RecommendationResponse,
} from '@flooring/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  /**
   * POST /api/v1/recommendations
   * Body: ParameterSelection
   * Returns: RecommendationResponse with products grouped by ProductGroup.
   */
  @Post()
  @UsePipes(new ZodValidationPipe(ParameterSelectionSchema))
  recommend(@Body() selection: ParameterSelection): Promise<RecommendationResponse> {
    return this.service.recommend(selection);
  }

  /**
   * POST /api/v1/recommendations/count
   * Same input but returns only the count — for the live UI indicator
   * during parameter selection.
   */
  @Post('count')
  @UsePipes(new ZodValidationPipe(ParameterSelectionSchema))
  async count(@Body() selection: ParameterSelection): Promise<{ count: number }> {
    const count = await this.service.countCompatible(selection);
    return { count };
  }
}
