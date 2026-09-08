import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const learningStates = sqliteTable('learning_states', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
});

export const learningActivity = sqliteTable(
  'learning_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    eventId: text('event_id').notNull(),
    day: text('day').notNull(),
    kind: text('kind').notNull(),
    itemKey: text('item_key').notNull(),
    label: text('label').notNull(),
    correct: integer('correct').notNull(),
    points: integer('points').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_activity_user_event').on(table.userId, table.eventId),
    index('idx_activity_user_day_item').on(
      table.userId,
      table.day,
      table.kind,
      table.itemKey,
    ),
  ],
);

export const plantedTrees = sqliteTable(
  'planted_trees',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    requestId: text('request_id').notNull(),
    treeId: text('tree_id').notNull(),
    treeName: text('tree_name').notNull(),
    cost: integer('cost').notNull(),
    plantedAt: integer('planted_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_planted_user_request').on(table.userId, table.requestId),
    index('idx_planted_user_time').on(table.userId, table.plantedAt),
  ],
);
