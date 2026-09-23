import type { AppointmentInput, Classification, Priority } from "@/lib/types";

const JEV_API_URL = process.env.JEV_API_URL || "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = process.env.JEV_MODEL || "jev-latest";

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

  let specialty = "Residencial";
  if (/panel|tablero|breaker|interruptor|centro de carga/.test(text)) specialty = "Tableros";
  else if (/luz|lámpara|luminaria|reflector/.test(text)) specialty = "Iluminación";
  else if (/solar|fotovolta|panel solar/.test(text)) specialty = "Energía solar";
  else if (/comercio|local|oficina|trifásic|industrial/.test(text) || input.propertyType === "Comercio") specialty = "Comercial";

  let priority: Priority = "Normal";
  if (hasSafetyRisk(risk)) priority = "Crítica";
  else if (risk.totalPowerLoss || /sin luz|sin energía|se baja|corto|descarga|toque/.test(text)) priority = "Alta";
  else if (/cotiza|presupuesto|preventiv/.test(text)) priority = "Baja";

  let duration = 60;
  if (serviceType === "Cotización") duration = 30;
  if (/tablero|cuatro|varios|completo|recableado/.test(text)) duration = 90;
  if (/industrial|trifásic|instalación completa/.test(text)) duration = 120;
  const confidence = text.length > 35 ? 0.88 : 0.72;
  return {
    serviceType,
    priority,
    specialty,
    estimatedDuration: `${duration} minutos`,
    requiresReview: hasSafetyRisk(risk) || confidence < 0.85,
    confidence,
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
  const apiKey = process.env.JEV_API_KEY;
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
      specialty: {
        type: "choice",
        instructions: "Selecciona la especialidad principal.",
        criteria: {
          "Residencial": "Casa o departamento.",
          "Comercial": "Comercio, oficina o sistema de mayor capacidad.",
          "Iluminación": "Lámparas, luminarias, reflectores o circuitos de iluminación.",
          "Tableros": "Centros de carga, interruptores, protecciones o distribución.",
          "Energía solar": "Paneles, inversores o sistemas fotovoltaicos."
        }
      },
      estimated_duration: {
        type: "choice",
        instructions: "Estima el bloque inicial de visita para un solo técnico.",
        criteria: {
          "30 minutos": "Cotización o revisión visual breve.",
          "60 minutos": "Diagnóstico o trabajo sencillo.",
          "90 minutos": "Instalación o reparación con varios componentes.",
          "120 minutos": "Trabajo amplio, comercial o de alta complejidad."
        }
      },
      human_review: {
        type: "noul",
        instructions: "¿La solicitud requiere revisión humana antes de confirmar?",
        criteria: {
          true: "Hay riesgo, información insuficiente, ambigüedad o posible trabajo fuera del alcance.",
          false: "La solicitud está descrita con claridad y puede programarse de forma ordinaria."
        }
      }
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
    const confidenceValues = [
      answers.service_type?.confidence,
      answers.priority?.confidence,
      answers.specialty?.confidence,
      answers.estimated_duration?.confidence,
    ].filter((value): value is number => Number.isFinite(value));
    const confidence = confidenceValues.length ? Math.min(...confidenceValues) : 0;
    const safetyOverride = hasSafetyRisk(input.riskSignals);
    return {
      serviceType: answers.service_type?.choice || "Diagnóstico",
      priority: (safetyOverride ? "Crítica" : answers.priority?.choice || "Normal") as Priority,
      specialty: answers.specialty?.choice || "Residencial",
      estimatedDuration: answers.estimated_duration?.choice || "60 minutos",
      requiresReview: safetyOverride || (answers.human_review?.noul ?? 1) >= 0.5 || confidence < 0.85,
      confidence,
      source: "Jev",
      model: result.model || JEV_MODEL,
    };
  } catch {
    return localClassification(input, "Jev no estuvo disponible; revisar la clasificación.");
  }
}

export function parseDuration(classification: Classification, requested?: number) {
  const duration = Number(classification.estimatedDuration.match(/\d+/)?.[0]);
  if ([30, 60, 90, 120].includes(duration)) return duration;
  return requested && [30, 60, 90, 120].includes(requested) ? requested : 60;
}

export const jevConfig = {
  enabled: Boolean(process.env.JEV_API_KEY),
  model: JEV_MODEL,
};
