import type { AppointmentInput, Classification, Priority } from "@/lib/types";
import { PRIORITIES } from "@/lib/types";

const SERVICE_TYPES = ["Diagnóstico", "Instalación", "Mantenimiento", "Reparación", "Cotización"] as const;

const apiKey = process.env.AI_GATEWAY_API_KEY;
const JEV_API_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const JEV_MODEL = process.env.JEV_MODEL || "typesafe-ai/jev";

function hasSafetyRisk(signals: AppointmentInput["riskSignals"]) {
  return Boolean(signals.sparks || signals.smoke || signals.burningSmell);
}

export function localClassification(input: AppointmentInput, fallbackReason = ""): Classification {
  const text = `${input.requestedService || ""} ${input.description || ""}`.toLowerCase();
  const risk = input.riskSignals;
  let serviceType = "Diagnóstico";
  if (/cotiza|presupuesto|visita técnica/.test(text)) serviceType = "Cotización";
  else if (/instala|colocar|montar|luminaria|contacto|apagador/.test(text)) serviceType = "Instalación";
  else if (/manten|preventiv|limpieza|ajuste/.test(text)) serviceType = "Mantenimiento";
  else if (/repara|cambiar|quemad|avería|falla/.test(text)) serviceType = "Reparación";

  let priority: Priority = "Normal";
  if (hasSafetyRisk(risk)) priority = "Crítica";
  else if (risk.totalPowerLoss || /sin luz|sin energía|se baja|corto|descarga|toque/.test(text)) priority = "Alta";
  else if (/cotiza|presupuesto|preventiv/.test(text)) priority = "Baja";

  return {
    serviceType,
    priority,
    source: fallbackReason ? "respaldo local" : "clasificador local",
    ...(fallbackReason ? { note: fallbackReason } : {}),
  };
}

type JevChoice = { choice?: string; confidence?: number };
type JevNoul = { noul?: number };
type JevResponse = {
  model?: string;
  answers?: Record<string, JevChoice & JevNoul>;
};

export async function classifyAppointment(input: AppointmentInput): Promise<Classification> {
  if (!apiKey) return localClassification(input);
  const body = {
    model: JEV_MODEL,
    state: {
      requested_service: input.requestedService,
      description: input.description,
      property_type: input.propertyType,
      risk_signals: input.riskSignals,
    },
    questions: {
      service_type: {
        type: "choice",
        instructions: "Clasifica el tipo principal de trabajo eléctrico solicitado.",
        criteria: {
          "Diagnóstico": "Localizar o entender una falla antes de repararla.",
          "Instalación": "Colocar equipo, cableado, contactos, iluminación o componentes nuevos.",
          "Mantenimiento": "Trabajo preventivo o revisión periódica sin una falla concreta.",
          "Reparación": "Falla identificable que requiere corrección o sustitución.",
          "Cotización": "Inspección y precio antes de autorizar el trabajo."
        }
      },
      priority: {
        type: "choice",
        instructions: "Determina la prioridad operativa. No des instrucciones de reparación.",
        criteria: {
          "Crítica": "Humo, chispas, olor a quemado o peligro inmediato.",
          "Alta": "Pérdida total de energía, disparos repetidos o falla que impide usar el inmueble.",
          "Normal": "Atención programada sin peligro inmediato.",
          "Baja": "Mejora, mantenimiento preventivo o cotización sin falla activa."
        }
      },
    }
  };

  try {
    const response = await fetch(JEV_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Jev respondió con estado ${response.status}`);
    const result = await response.json() as JevResponse;
    const answers = result.answers || {};
    const safetyOverride = hasSafetyRisk(input.riskSignals);
    return {
      serviceType: SERVICE_TYPES.includes(answers.service_type?.choice as (typeof SERVICE_TYPES)[number]) ? answers.service_type!.choice! : "Diagnóstico",
      priority: safetyOverride ? "Crítica" : PRIORITIES.includes(answers.priority?.choice as Priority) ? answers.priority!.choice as Priority : "Normal",
      source: "Jev",
      model: result.model || JEV_MODEL,
    };
  } catch {
    return localClassification(input, "Jev no estuvo disponible; revisar la clasificación.");
  }
}

export const jevConfig = {
  enabled: Boolean(apiKey),
  model: JEV_MODEL,
};
