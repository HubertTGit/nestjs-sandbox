import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TodoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Buy milk' })
  task: string;

  @ApiProperty({ example: false })
  isCompleted: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CreateTodoDto {
  @ApiProperty({ example: 'Buy milk', description: 'Todo task description' })
  task: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether the todo is completed',
  })
  isCompleted?: boolean;
}

export class UpdateTodoDto {
  @ApiPropertyOptional({
    example: 'Buy oat milk',
    description: 'Updated todo task description',
  })
  task?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Updated completion status',
  })
  isCompleted?: boolean;
}
