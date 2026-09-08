import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const learningStates = sqliteTable('learning_states', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
});
