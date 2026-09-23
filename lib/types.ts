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
  specialty: string;
  estimatedDuration: string;
  requiresReview: boolean;
  confidence: number;
  source: string;
  model?: string;
  note?: string;
};

export type Appointment = {
  id: string;
  folio: string;
  createdAt: string;
  updatedAt?: string;
  scheduledAt: string;
  durationMin: number;
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
};

export type AppointmentInput = Pick<
  Appointment,
  "clientName" | "phone" | "email" | "address" | "propertyType" | "requestedService" | "description" | "scheduledAt" | "riskSignals" | "notes"
> & { durationMin?: number };

export type DashboardStats = {
  total: number;
  today: number;
  pendingReview: number;
  urgent: number;
  completionRate: number;
  byStatus: Record<AppointmentStatus, number>;
  byPriority: Record<Priority, number>;
};
