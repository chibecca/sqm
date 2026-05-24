import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { ParameterSelectionsController } from './parameter-selections.controller';
import { ParameterSelectionsService } from './parameter-selections.service';

@Module({
  imports: [ProjectsModule, RecommendationsModule],
  controllers: [ParameterSelectionsController],
  providers: [ParameterSelectionsService],
})
export class ParameterSelectionsModule {}
