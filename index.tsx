import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import Papa from 'papaparse';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Upload, 
  Search, 
  User, 
  Clock, 
  AlertCircle, 
  FileText, 
  Activity, 
  LogOut, 
  MapPin,
  Calendar,
  Bed,
  Stethoscope,
  DoorOpen,
  AlertTriangle,
  LayoutDashboard,
  Users
} from 'lucide-react';
import { format, parse, differenceInMinutes, isValid } from 'date-fns';
import { ValidationReport, ValidationError } from './ValidationReport';
import { Dashboard } from './Dashboard';

// --- THEME CONSTANTS ---
export const THEME = {
  bg: '#12141d',
  sidebar: '#1a1c23',
  card: '#1a1c23',
  accent: '#00ffa2',
  error: '#ef4444',
  warning: '#f59e0b',
  textMain: '#ffffff',
  textMuted: '#94a3b8',
  border: '#2d3748'
};

// --- TYPES ---

export interface MovementLog {
  id: string; // unique key for list rendering
  ala: string;
  tipoAla: string;
  localizacao: string;
  refLocalizacao: string;
  leito: string;
  entrada: Date | null;
  saida: Date | null;
  durationMinutes: number;
}

export interface PatientAdmission {
  id: string; // using passagem as ID
  passagem: string;
  ses: string;
  name: string;
  birthDate: string;
  age: string;
  municipio: string;
  uf: string; // New
  localAdmissao: string; // New
  admissaoAno: string; // New
  admissaoMes: string; // New
  riskColor: string;
  
  // Timestamps
  admissionDate: Date | null;
  triageDate: Date | null;
  medicalDischargeDate: Date | null;
  hospitalDischargeDate: Date | null;
  
  // Metrics
  totalStayMinutes: number;
  triageWaitMinutes: number;
  idleTimeMinutes: number; // between medical and hospital discharge
  sumOfLogsMinutes: number; // Sum of all individual log durations
  
  // Flags for Data Consistency
  hasDischargeError: boolean; // Medical Discharge > Hospital Discharge
  hasSumError: boolean; // Sum of Logs > Total Stay
  
  logs: MovementLog[];
  
  // Aggregations
  timeByAlaType: Record<string, number>;
  timeByRefLoc: Record<string, number>;
}

// Type for the unified timeline
type TimelineEvent = 
  | { type: 'log'; date: Date; data: MovementLog }
  | { type: 'medical-discharge'; date: Date }
  | { type: 'hospital-discharge'; date: Date };

// --- UTILS ---

// Helper to combine date string and time string into a Date object
const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr || !timeStr) return null;
  try {
    const d = dateStr.trim();
    const t = timeStr.trim();
    const combined = `${d} ${t}`;
    
    let parsed = parse(combined, 'dd/MM/yyyy HH:mm:ss', new Date());
    if (isValid(parsed)) return parsed;
    
    parsed = parse(combined, 'dd/MM/yyyy HH:mm', new Date());
    if (isValid(parsed)) return parsed;

    parsed = parse(combined, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (isValid(parsed)) return parsed;
    
    return null;
  } catch (e) {
    return null;
  }
};

export const formatDuration = (minutes: number) => {
  const isNegative = minutes < 0;
  const absMin = Math.abs(minutes);
  
  const days = Math.floor(absMin / 1440);
  const hours = Math.floor((absMin % 1440) / 60);
  const mins = Math.floor(absMin % 60); // Round down to avoid decimals
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  
  const text = parts.length > 0 ? parts.join(' ') : '0m';
  return isNegative ? `- ${text}` : text;
};

// --- DATA PROCESSING ---

const processCSVData = (data: any[]): { admissions: PatientAdmission[], errors: ValidationError[] } => {
  const admissionsMap = new Map<string, PatientAdmission>();
  const processedLogSignatures = new Set<string>(); // For deduplication
  const errors: ValidationError[] = [];

  data.forEach((row: any, index: number) => {
    // Normalize keys
    const normalizeKey = (key: string) => {
        const lowerKey = key.toLowerCase();
        if (key.includes('Ref') && key.includes('Loc')) return 'Ref Localização';
        if (key.includes('Tipo') && key.includes('Ala')) return 'Tipo de Ala';
        if (lowerKey.includes('localiza') && !key.includes('Ref')) return 'localização';
        if (lowerKey.includes('localadmissao')) return 'localadmissao';
        if (lowerKey.includes('admissaoano')) return 'admissaoano';
        if (lowerKey.includes('admissaomes')) return 'admissaomes';
        return key;
    };

    const safeRow: any = {};
    Object.keys(row).forEach(k => {
        safeRow[normalizeKey(k)] = row[k];
    });

    const passagem = safeRow['passagem'];
    if (!passagem) return;

    // Timestamps
    const admissionDate = parseDateTime(safeRow['admissaodt'], safeRow['admissaohr']);
    const triageDate = parseDateTime(safeRow['triagemdt'], safeRow['triagemhr']);
    const medicalDischargeDate = parseDateTime(safeRow['altamedicadt'], safeRow['altamedicahr']);
    const hospitalDischargeDate = parseDateTime(safeRow['altahospitalardt'], safeRow['altahospitalarhr']);
    const logEntry = parseDateTime(safeRow['entradalocaldt'], safeRow['entradalocalhr']);
    let logExit = parseDateTime(safeRow['saidalocaldt'], safeRow['saidalocalhr']);
    
    // Deduplication Logic: Create a unique signature for this log entry
    // Signature: Passagem + EntryTime + Ala + Leito
    const logSignature = `${passagem}|${logEntry?.getTime()}|${logExit?.getTime()}|${safeRow['ala']}|${safeRow['leito']}`;
    
    if (processedLogSignatures.has(logSignature)) {
        // Validation Rule 2: Signal duplicate lines
        errors.push({
            id: `dup-${passagem}-${index}`,
            type: 'DUPLICATE',
            passagem: passagem,
            patient: safeRow['paciente'] || 'Desconhecido',
            message: `Linha duplicada (ignorada no cálculo): Ala ${safeRow['ala']}, Entrada ${safeRow['entradalocaldt']}`
        });
        return; // Skip duplicate log for calculation
    }
    processedLogSignatures.add(logSignature);

    // Duration Calc
    let logDuration = 0;
    if (logEntry && logExit) {
        const diff = differenceInMinutes(logExit, logEntry);
        logDuration = diff > 0 ? diff : 0;
    } else if (logEntry && !logExit && hospitalDischargeDate && hospitalDischargeDate > logEntry) {
         logDuration = differenceInMinutes(hospitalDischargeDate, logEntry);
         logExit = hospitalDischargeDate; 
    }

    const movement: MovementLog = {
      id: `${passagem}-${index}`,
      ala: safeRow['ala'] || 'N/A',
      tipoAla: safeRow['Tipo de Ala'] || 'Indefinido',
      localizacao: safeRow['localização'] || safeRow['localizacao'] || '-',
      refLocalizacao: safeRow['Ref Localização'] || 'Geral',
      leito: safeRow['leito'] || '-',
      entrada: logEntry,
      saida: logExit,
      durationMinutes: logDuration
    };

    if (!admissionsMap.has(passagem)) {
      admissionsMap.set(passagem, {
        id: passagem,
        passagem: passagem,
        ses: safeRow['numeroses'],
        name: safeRow['paciente'],
        birthDate: safeRow['dtnascimento'],
        age: safeRow['Idade'],
        municipio: safeRow['município'] || safeRow['municipio'],
        uf: safeRow['uf'] || '',
        localAdmissao: safeRow['localadmissao'] || 'Desconhecido',
        admissaoAno: safeRow['admissaoano'] || '',
        admissaoMes: safeRow['admissaomes'] || '',
        riskColor: safeRow['classificacaorisco'],
        admissionDate,
        triageDate,
        medicalDischargeDate,
        hospitalDischargeDate,
        totalStayMinutes: 0, 
        triageWaitMinutes: 0, 
        idleTimeMinutes: 0,
        sumOfLogsMinutes: 0,
        hasDischargeError: false,
        hasSumError: false,
        logs: [],
        timeByAlaType: {},
        timeByRefLoc: {}
      });
    }

    const adm = admissionsMap.get(passagem)!;
    adm.logs.push(movement);
  });

  // Final Calculations per Admission
  const admissions = Array.from(admissionsMap.values()).map(adm => {
    // Sort logs chronologically
    adm.logs.sort((a, b) => {
        if (!a.entrada) return 1;
        if (!b.entrada) return -1;
        return a.entrada.getTime() - b.entrada.getTime();
    });

    // Metric 1: Total Stay
    if (adm.hospitalDischargeDate && adm.admissionDate) {
        adm.totalStayMinutes = differenceInMinutes(adm.hospitalDischargeDate, adm.admissionDate);
    }

    // Metric 2: Triage Wait
    if (adm.triageDate && adm.admissionDate) {
        adm.triageWaitMinutes = differenceInMinutes(adm.triageDate, adm.admissionDate);
    }

    // Metric 4: Idle Time & Error Check
    if (adm.hospitalDischargeDate && adm.medicalDischargeDate) {
        adm.idleTimeMinutes = differenceInMinutes(adm.hospitalDischargeDate, adm.medicalDischargeDate);
        // Error: Medical Discharge happening AFTER Hospital Discharge
        if (adm.medicalDischargeDate > adm.hospitalDischargeDate) {
            adm.hasDischargeError = true;
            // Also add to global errors if strictly requested, but handled inline in UI for now.
            // Let's add it to the report as well for completeness since we are "Auditing"
            errors.push({
                id: `chrono-${adm.passagem}`,
                type: 'CHRONOLOGY',
                passagem: adm.passagem,
                patient: adm.name,
                message: `Erro Cronológico: Alta Médica (${format(adm.medicalDischargeDate, 'dd/MM HH:mm')}) registrada após Alta Hospitalar (${format(adm.hospitalDischargeDate, 'dd/MM HH:mm')}).`
            });
        }
    }

    // Metric 3 & Aggregations
    adm.sumOfLogsMinutes = 0;
    adm.logs.forEach(log => {
        adm.sumOfLogsMinutes += log.durationMinutes;
        adm.timeByAlaType[log.tipoAla] = (adm.timeByAlaType[log.tipoAla] || 0) + log.durationMinutes;
        adm.timeByRefLoc[log.refLocalizacao] = (adm.timeByRefLoc[log.refLocalizacao] || 0) + log.durationMinutes;
    });

    // Validation Rule 1: Sum of logs > Total Stay
    if (adm.sumOfLogsMinutes > adm.totalStayMinutes) {
        adm.hasSumError = true;
        errors.push({
            id: `sum-${adm.passagem}`,
            type: 'INCONSISTENCY',
            passagem: adm.passagem,
            patient: adm.name,
            message: `Soma dos logs (${formatDuration(adm.sumOfLogsMinutes)}) excede o tempo total de passagem (${formatDuration(adm.totalStayMinutes)}). Verifique se há sobreposição de horários.`
        });
    }

    return adm;
  });

  return { admissions, errors };
};

// --- COMPONENTS ---

export const KPICard = ({ title, value, subtitle, icon: Icon, color, isError }: { title: string, value: string, subtitle?: string, icon: any, color?: string, isError?: boolean }) => {
    const finalColor = isError ? THEME.error : (color || THEME.accent);
    const bgColor = isError ? `${THEME.error}10` : THEME.card;

    return (
        <div className="p-4 rounded-lg border border-opacity-10 shadow-lg relative overflow-hidden group hover:border-opacity-30 transition-all" style={{ backgroundColor: bgColor, borderColor: finalColor }}>
            <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium opacity-70" style={{ color: isError ? '#ff8888' : THEME.textMuted }}>{title}</h3>
            <Icon size={20} color={finalColor} />
            </div>
            <div className="text-2xl font-bold tracking-tight mb-1" style={{ color: isError ? '#ff8888' : THEME.textMain }}>
            {value}
            </div>
            {subtitle && <div className="text-xs opacity-50" style={{ color: THEME.textMain }}>{subtitle}</div>}
            
            {/* Decorative blur */}
            <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white opacity-5 rounded-full blur-2xl group-hover:opacity-10 transition-opacity"></div>
        </div>
    );
};

const TimelineEventItem: React.FC<{ event: TimelineEvent, isLast: boolean }> = ({ event, isLast }) => {
  
  if (event.type === 'medical-discharge') {
    return (
      <div className="relative pl-6 pb-6">
        {!isLast && <div className="absolute left-[9px] top-3 bottom-0 w-0.5 bg-gray-800"></div>}
        <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 border-amber-500 bg-[#12141d] flex items-center justify-center z-10">
          <Stethoscope size={10} className="text-amber-500" />
        </div>
        <div className="bg-amber-900/20 p-3 rounded-md border border-amber-500/50">
          <div className="flex justify-between items-center">
             <span className="font-bold text-amber-500">Alta Médica</span>
             <span className="font-mono text-sm text-amber-200">{format(event.date, 'dd/MM/yyyy HH:mm')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (event.type === 'hospital-discharge') {
    return (
      <div className="relative pl-6 pb-6">
         {!isLast && <div className="absolute left-[9px] top-3 bottom-0 w-0.5 bg-gray-800"></div>}
         <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 border-red-500 bg-[#12141d] flex items-center justify-center z-10">
           <DoorOpen size={10} className="text-red-500" />
         </div>
         <div className="bg-red-900/20 p-3 rounded-md border border-red-500/50">
           <div className="flex justify-between items-center">
              <span className="font-bold text-red-500">Alta Hospitalar</span>
              <span className="font-mono text-sm text-red-200">{format(event.date, 'dd/MM/yyyy HH:mm')}</span>
           </div>
         </div>
       </div>
    );
  }

  // Standard Log
  const log = event.data;
  return (
    <div className="relative pl-6 pb-6">
      {!isLast && (
        <div className="absolute left-[9px] top-3 bottom-0 w-0.5 bg-gray-800"></div>
      )}
      <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10" style={{ borderColor: THEME.accent, backgroundColor: THEME.bg }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.accent }}></div>
      </div>
      
      <div className="bg-[#1e212b] p-3 rounded-md border border-gray-800 hover:border-gray-700 transition-colors">
          <div className="flex justify-between items-start">
              <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${THEME.accent}20`, color: THEME.accent }}>
                          {log.refLocalizacao}
                      </span>
                      <span className="text-sm text-white font-medium">{log.localizacao}</span>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-4">
                      <span className="flex items-center gap-1"><Bed size={12} /> Leito: {log.leito}</span>
                      <span className="flex items-center gap-1"><MapPin size={12} /> Ala: {log.ala}</span>
                  </div>
              </div>
              <div className="text-right">
                  <div className="text-xs text-gray-400 font-mono">
                    {log.entrada ? format(log.entrada, 'dd/MM HH:mm') : '---'} 
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {log.saida ? format(log.saida, 'dd/MM HH:mm') : 'Em curso'}
                  </div>
                  <div className="text-xs font-bold mt-1" style={{ color: THEME.accent }}>
                      {formatDuration(log.durationMinutes)}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<PatientAdmission[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'LIST' | 'DASHBOARD'>('LIST');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const { admissions, errors } = processCSVData(results.data);
          setData(admissions);
          setValidationErrors(errors);
          if (admissions.length > 0) setSelectedId(admissions[0].id);
          setLoading(false);
        }
      });
    }
  };

  const filteredPatients = useMemo(() => {
    return data.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.passagem.includes(searchTerm) ||
      p.ses.includes(searchTerm)
    );
  }, [data, searchTerm]);

  const selectedPatient = useMemo(() => 
    data.find(p => p.id === selectedId), 
  [data, selectedId]);

  // Combined Timeline Events
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!selectedPatient) return [];
    
    const events: TimelineEvent[] = selectedPatient.logs
      .filter(l => l.entrada !== null)
      .map(l => ({ type: 'log', date: l.entrada!, data: l }));

    if (selectedPatient.medicalDischargeDate) {
      events.push({ type: 'medical-discharge', date: selectedPatient.medicalDischargeDate });
    }

    if (selectedPatient.hospitalDischargeDate) {
      events.push({ type: 'hospital-discharge', date: selectedPatient.hospitalDischargeDate });
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [selectedPatient]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    if (!selectedPatient) return [];
    return (Object.entries(selectedPatient.timeByRefLoc) as [string, number][]).map(([name, value]) => ({
      name,
      minutes: value,
      label: formatDuration(value)
    })).sort((a, b) => b.minutes - a.minutes);
  }, [selectedPatient]);

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans" style={{ backgroundColor: THEME.bg, color: THEME.textMain }}>
      
      {/* SIDEBAR */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-800" style={{ backgroundColor: THEME.sidebar }}>
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: THEME.accent }}>
            <Activity size={24} />
            SGP Auditoria
          </h1>
          <p className="text-xs text-gray-500 mt-1">Análise de Fluxo Hospitalar</p>
        </div>

        {/* Upload Area */}
        <div className="p-4 border-b border-gray-800">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-gray-500 hover:bg-gray-800 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-6 h-6 mb-2 text-gray-400 group-hover:text-white" />
                    <p className="text-xs text-gray-500 group-hover:text-gray-300">Upload CSV (Logs)</p>
                </div>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
        </div>

        {/* Navigation */}
        <div className="p-2 space-y-1 border-b border-gray-800">
            <button 
                onClick={() => setCurrentView('LIST')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${currentView === 'LIST' ? 'bg-[#00ffa2] bg-opacity-10 text-[#00ffa2]' : 'text-gray-400 hover:bg-gray-800'}`}
            >
                <Users size={18} />
                Lista de Pacientes
            </button>
            <button 
                onClick={() => setCurrentView('DASHBOARD')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${currentView === 'DASHBOARD' ? 'bg-[#00ffa2] bg-opacity-10 text-[#00ffa2]' : 'text-gray-400 hover:bg-gray-800'}`}
            >
                <LayoutDashboard size={18} />
                Dashboard Geral
            </button>
        </div>

        {/* Search (Only visible in LIST view) */}
        {currentView === 'LIST' && (
            <>
                <div className="px-4 py-4 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                        <input 
                            type="text" 
                            placeholder="Buscar Paciente/Pront..." 
                            className="w-full bg-[#0d0e14] border border-gray-700 rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-[#00ffa2] text-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Patient List */}
                <div className="flex-1 overflow-y-auto">
                    {loading && <div className="p-4 text-center text-gray-500 text-sm">Processando...</div>}
                    {!loading && filteredPatients.map(patient => (
                        <div 
                            key={patient.id}
                            onClick={() => setSelectedId(patient.id)}
                            className={`p-4 border-b border-gray-800 cursor-pointer transition-colors hover:bg-opacity-50 hover:bg-gray-800 ${selectedId === patient.id ? 'bg-[#00ffa2] bg-opacity-10 border-l-4 border-l-[#00ffa2]' : 'border-l-4 border-l-transparent'}`}
                        >
                            <div className="font-medium text-sm truncate">{patient.name}</div>
                            <div className="flex justify-between mt-1">
                                <span className="text-xs text-gray-500">Pass: {patient.passagem}</span>
                                <span className="text-xs text-gray-500">{patient.logs.length} logs</span>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {currentView === 'DASHBOARD' ? (
             data.length > 0 ? (
                 <Dashboard data={data} />
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-6">
                        <LayoutDashboard className="text-gray-500" size={48} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Sem dados para o Dashboard</h2>
                    <p className="text-gray-400 max-w-md">
                        Faça upload de um arquivo CSV primeiro para visualizar a análise global.
                    </p>
                </div>
             )
        ) : (
            selectedPatient ? (
                <>
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-800 flex justify-between items-start" style={{ backgroundColor: THEME.bg }}>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                                {selectedPatient.name}
                                <span className={`px-2 py-0.5 text-xs rounded-full bg-gray-800 text-white border border-gray-700`}>
                                    {selectedPatient.age} Anos
                                </span>
                            </h2>
                            <div className="flex items-center gap-6 text-sm text-gray-400 mt-2">
                                <span className="flex items-center gap-1"><User size={14} /> SES: {selectedPatient.ses}</span>
                                <span className="flex items-center gap-1"><Calendar size={14} /> DN: {selectedPatient.birthDate}</span>
                                <span className="flex items-center gap-1"><MapPin size={14} /> {selectedPatient.municipio}</span>
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedPatient.riskColor === 'Vermelho' ? 'red' : selectedPatient.riskColor === 'Amarelo' ? 'yellow' : 'green' }}></div>
                                    Risco: {selectedPatient.riskColor}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-8 text-right">
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">Admissão</div>
                                <div className="font-mono text-lg text-[#00ffa2]">{selectedPatient.admissionDate ? format(selectedPatient.admissionDate, 'dd/MM/yyyy HH:mm') : 'N/A'}</div>
                            </div>
                            {selectedPatient.medicalDischargeDate && (
                                <div>
                                    <div className="text-xs text-amber-500/70 uppercase tracking-wider">Alta Médica</div>
                                    <div className="font-mono text-lg text-amber-500">{format(selectedPatient.medicalDischargeDate, 'dd/MM/yyyy HH:mm')}</div>
                                </div>
                            )}
                             {selectedPatient.hospitalDischargeDate && (
                                <div>
                                    <div className="text-xs text-red-500/70 uppercase tracking-wider">Alta Hosp.</div>
                                    <div className="font-mono text-lg text-red-500">{format(selectedPatient.hospitalDischargeDate, 'dd/MM/yyyy HH:mm')}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8">
                        
                        {/* ALERTS SECTION */}
                        {selectedPatient.hasSumError && (
                            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500 flex items-start gap-3">
                                 <AlertTriangle className="text-red-500 flex-shrink-0" />
                                 <div>
                                     <h3 className="text-red-500 font-bold text-sm">Inconsistência de Dados (Soma dos Tempos)</h3>
                                     <p className="text-red-200/70 text-xs mt-1">
                                         A soma do tempo de permanência nas alas ({formatDuration(selectedPatient.sumOfLogsMinutes)}) excede o tempo total de passagem do paciente ({formatDuration(selectedPatient.totalStayMinutes)}). Verifique se há sobreposição de horários entre os setores.
                                     </p>
                                 </div>
                            </div>
                        )}

                        {/* KPI GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <KPICard 
                                title="Tempo Total Passagem" 
                                value={formatDuration(selectedPatient.totalStayMinutes)} 
                                icon={Clock}
                                subtitle="Admissão -> Alta Hospitalar"
                            />
                             <KPICard 
                                title="Espera Triagem" 
                                value={formatDuration(selectedPatient.triageWaitMinutes)} 
                                icon={AlertCircle}
                                color="#f59e0b" // Amber
                                subtitle="Admissão -> Triagem"
                            />
                             <KPICard 
                                title="Ociosidade (Alta)" 
                                value={selectedPatient.hasDischargeError ? "Erro Cronológico" : formatDuration(selectedPatient.idleTimeMinutes)} 
                                icon={LogOut}
                                color="#ef4444" // Red
                                isError={selectedPatient.hasDischargeError}
                                subtitle={selectedPatient.hasDischargeError ? "Alta Médica > Alta Hosp." : "Alta Médica -> Alta Hosp."}
                            />
                            <KPICard 
                                title="Total Movimentações" 
                                value={selectedPatient.logs.length.toString()} 
                                icon={FileText}
                                color="#3b82f6" // Blue
                                subtitle="Registros válidos"
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* CHART SECTION (2 Columns) */}
                            <div className="lg:col-span-2 space-y-8">
                                {/* Bar Chart */}
                                <div className="p-6 rounded-lg border border-gray-800 shadow-xl" style={{ backgroundColor: THEME.card }}>
                                    <h3 className="text-lg font-medium mb-6 flex items-center gap-2">
                                        <Activity size={18} className="text-[#00ffa2]" />
                                        Tempo por Ref Localização
                                    </h3>
                                    <div className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={chartData}
                                                layout="vertical"
                                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                                <XAxis type="number" hide />
                                                <YAxis 
                                                    dataKey="name" 
                                                    type="category" 
                                                    width={150} 
                                                    tick={{ fill: '#9ca3af', fontSize: 12 }} 
                                                />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: '#1a1c23', borderColor: '#333', color: '#fff' }}
                                                    itemStyle={{ color: '#fff' }}
                                                    labelStyle={{ color: '#94a3b8' }}
                                                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                                    formatter={(value: number) => [formatDuration(value), 'Tempo']}
                                                />
                                                <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                                                    {chartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={THEME.accent} opacity={0.8} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Aggregated By Ala Type Table */}
                                <div className="p-6 rounded-lg border border-gray-800 shadow-xl" style={{ backgroundColor: THEME.card }}>
                                    <h3 className="text-lg font-medium mb-4">Tempos por Tipo de Ala</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {(Object.entries(selectedPatient.timeByAlaType) as [string, number][]).map(([type, minutes]) => (
                                            <div key={type} className="bg-[#12141d] p-3 rounded border border-gray-800">
                                                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">{type}</div>
                                                <div className="font-bold text-[#00ffa2]">{formatDuration(minutes)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* TIMELINE SECTION (1 Column) */}
                            <div className="lg:col-span-1">
                                <div className="p-6 rounded-lg border border-gray-800 shadow-xl h-full" style={{ backgroundColor: THEME.card }}>
                                    <h3 className="text-lg font-medium mb-6">Linha do Tempo</h3>
                                    <div className="space-y-0 relative">
                                        {timelineEvents.map((event, idx) => (
                                            <TimelineEventItem 
                                                key={idx} 
                                                event={event} 
                                                isLast={idx === timelineEvents.length - 1} 
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-6">
                        <Activity className="text-[#00ffa2]" size={48} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo ao SGP Auditoria</h2>
                    <p className="text-gray-400 max-w-md">
                        Faça o upload do seu arquivo CSV de logs hospitalares na barra lateral para iniciar a análise de fluxo e indicadores.
                    </p>
                </div>
            )
        )}
        
        {/* Floating Validation Report */}
        <ValidationReport errors={validationErrors} />

      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (!container) throw new Error("Failed to find the root element");
const root = createRoot(container);
root.render(<App />);