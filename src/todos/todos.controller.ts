import {
  Authenticate,
  JwtBearerProvider,
  Public,
} from '@nestjs/authentication';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Todo } from '../database/schema.js';
import { CreateTodoDto, TodoDto, UpdateTodoDto } from './todo.dto.js';
import { TodosService } from './todos.service.js';

@ApiTags('Todos')
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  @Authenticate({ providers: [JwtBearerProvider] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a todo' })
  @ApiCreatedResponse({ type: TodoDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  create(@Body() body: CreateTodoDto): Promise<Todo> {
    return this.todosService.create(body);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all todos' })
  @ApiOkResponse({ type: [TodoDto] })
  findAll(): Promise<Todo[]> {
    return this.todosService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a todo by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: TodoDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Todo> {
    return this.todosService.findOne(id);
  }

  @Patch(':id')
  @Authenticate({ providers: [JwtBearerProvider] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a todo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: TodoDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTodoDto,
  ): Promise<Todo> {
    return this.todosService.update(id, body);
  }

  @Delete(':id')
  @Authenticate({ providers: [JwtBearerProvider] })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a todo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiNoContentResponse({ description: 'Todo deleted' })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.todosService.remove(id);
  }
}
