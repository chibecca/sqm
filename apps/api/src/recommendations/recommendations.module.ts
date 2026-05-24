import { Module } from '@nestjs/common';
import { ParameterResolverService } from './parameter-resolver.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  controllers: [RecommendationsController],
  providers: [ParameterResolverService, RecommendationsService],
  exports: [RecommendationsService, ParameterResolverService],
})
export class RecommendationsModule {}
