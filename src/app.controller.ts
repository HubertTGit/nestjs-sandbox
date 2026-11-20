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
  AppService,
  type CreateTodoDto,
  type UpdateTodoDto,
} from './app.service.js';
import type { Todo } from './database/schema.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  checkHealth(): Promise<{ status: 'ok' }> {
    return this.appService.checkDatabase();
  }

  @Post('todos')
  createTodo(@Body() body: CreateTodoDto): Promise<Todo> {
    return this.appService.createTodo(body);
  }

  @Get('todos')
  findAllTodos(): Promise<Todo[]> {
    return this.appService.findAllTodos();
  }

  @Get('todos/:id')
  findTodoById(@Param('id', ParseIntPipe) id: number): Promise<Todo> {
    return this.appService.findTodoById(id);
  }

  @Patch('todos/:id')
  updateTodo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTodoDto,
  ): Promise<Todo> {
    return this.appService.updateTodo(id, body);
  }

  @Delete('todos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTodo(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.appService.deleteTodo(id);
  }
}
