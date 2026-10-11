import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { success: true; message: string } {
    return {
      success: true,
      message: 'AttendHub API is running',
    };
  }
}
