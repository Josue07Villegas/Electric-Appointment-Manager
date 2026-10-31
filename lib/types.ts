export const STATUSES = ["Pendiente", "Confirmada", "En camino", "En servicio", "Completada", "Cancelada"] as const;
export const PRIORITIES = ["Crítica", "Alta", "Normal", "Baja"] as const;

export type AppointmentStatus = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export type RiskSignals = {
  sparks: boolean;
  smoke: boolean;
  burningSmell: boolean;
  totalPowerLoss: boolean;
};

export type Classification = {
  serviceType: string;
  priority: Priority;
  source: string;
  model?: string;
  note?: string;
  rawPriority?: Priority;
  safetyOverride?: boolean;
};

export type Appointment = {
  id: string;
  folio: string;
  createdAt: string;
  updatedAt?: string;
  revision: number;
  scheduledAt: string | null;
  durationMin: number | null;
  preferredSlots: string[];
  clientName: string;
  phone: string;
  email: string;
  address: string;
  propertyType: string;
  requestedService: string;
  description: string;
  riskSignals: RiskSignals;
  classification: Classification;
  status: AppointmentStatus;
  technician: string;
  notes: string;
  completedAt: string | null;
  firstConfirmedAt: string | null;
  arrivedAt: string | null;
  arrivalScheduledAt: string | null;
};

export type AppointmentInput = Pick<
  Appointment,
  "clientName" | "phone" | "email" | "address" | "propertyType" | "requestedService" | "description" | "riskSignals" | "notes" | "preferredSlots"
>;

export type DashboardStats = {
  kpis: OperationalKpis;
  total: number;
  today: number;
  pendingReview: number;
  urgent: number;
  completionRate: number;
  byStatus: Record<AppointmentStatus, number>;
  byPriority: Record<Priority, number>;
};

export type OperationalKpis = {
  scheduling: { averageMinutes: number | null; valid: number; excluded: number; exclusionReasons: Record<string, number>; reductionPercent: number | null; targetMet: boolean | null };
  punctuality: { percent: number | null; valid: number; punctual: number; excluded: number; exclusionReasons: Record<string, number>; increasePercent: number | null; targetMet: boolean | null };
};
