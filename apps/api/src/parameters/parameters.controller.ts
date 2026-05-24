import { Controller, Get } from '@nestjs/common';
import type { ParameterTree } from '@flooring/validation';
import { ParametersService } from './parameters.service';

@Controller('parameters')
export class ParametersController {
  constructor(private readonly service: ParametersService) {}

  @Get()
  getTree(): Promise<ParameterTree> {
    return this.service.getTree();
  }
}
