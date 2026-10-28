import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const consultationRequests = pgTable("consultation_requests", {
  id: uuid("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  role: text("role").notNull(),
  service: text("service").notNull(),
  message: text("message").notNull(),
  consent: text("consent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertConsultationSchema = createInsertSchema(consultationRequests).omit({ createdAt: true });
export type ConsultationRequest = typeof consultationRequests.$inferSelect;

// Short-lived pseudonymous counters, shared across API processes.
export const consultationLimits = pgTable("consultation_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
