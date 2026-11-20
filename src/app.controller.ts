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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service.js';
import type { Todo } from './database/schema.js';
import { CreateTodoDto, TodoDto, UpdateTodoDto } from './todo.dto.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiTags('app')
  @ApiOperation({ summary: 'Hello endpoint' })
  @ApiOkResponse({ type: String })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiTags('app')
  @ApiOperation({ summary: 'Check database connectivity' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { status: { type: 'string', example: 'ok' } },
    },
  })
  checkHealth(): Promise<{ status: 'ok' }> {
    return this.appService.checkDatabase();
  }

  @Post('todos')
  @ApiTags('todos')
  @ApiOperation({ summary: 'Create a todo' })
  @ApiCreatedResponse({ type: TodoDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  createTodo(@Body() body: CreateTodoDto): Promise<Todo> {
    return this.appService.createTodo(body);
  }

  @Get('todos')
  @ApiTags('todos')
  @ApiOperation({ summary: 'List all todos' })
  @ApiOkResponse({ type: [TodoDto] })
  findAllTodos(): Promise<Todo[]> {
    return this.appService.findAllTodos();
  }

  @Get('todos/:id')
  @ApiTags('todos')
  @ApiOperation({ summary: 'Get a todo by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: TodoDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  findTodoById(@Param('id', ParseIntPipe) id: number): Promise<Todo> {
    return this.appService.findTodoById(id);
  }

  @Patch('todos/:id')
  @ApiTags('todos')
  @ApiOperation({ summary: 'Update a todo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: TodoDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  updateTodo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTodoDto,
  ): Promise<Todo> {
    return this.appService.updateTodo(id, body);
  }

  @Delete('todos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiTags('todos')
  @ApiOperation({ summary: 'Delete a todo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiNoContentResponse({ description: 'Todo deleted' })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  deleteTodo(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.appService.deleteTodo(id);
  }
}
