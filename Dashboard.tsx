import React, { useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie 
} from 'recharts';
import { 
  Users, Clock, Activity, Bed, Timer, Filter, Stethoscope, ChevronDown, ToggleLeft, ToggleRight, Eye, EyeOff
} from 'lucide-react';
import { PatientAdmission, THEME, formatDuration, KPICard } from './index';

interface DashboardProps {
  data: PatientAdmission[];
}

// --- HELPER FUNCTIONS ---

const isPS = (type: string, ala: string) => {
    const t = (type || '').toLowerCase();
    const a = (ala || '').toLowerCase();
    // Broad matching for ER/PS
    return t.includes('ps') || t.includes('pronto') || t.includes('emerg') || 
           a.includes('ps') || a.includes('pronto') || a.includes('emerg');
};

const calculateAverage = (sum: number, count: number) => count > 0 ? sum / count : 0;

const getRiskColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('vermelho')) return '#ef4444'; // Red
    if (n.includes('laranja')) return '#f97316';  // Orange
    if (n.includes('amarelo')) return '#f59e0b';  // Amber/Yellow
    if (n.includes('verde')) return '#22c55e';    // Green
    if (n.includes('azul')) return '#3b82f6';     // Blue
    return '#64748b'; // Slate 500 default for others
};

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  // --- FILTER STATE ---
  const [filters, setFilters] = useState({
    localAdmissao: 'Todos',
    risco: 'Todos',
    ala: 'Todos',
    tipoAla: 'Todos',
    ano: 'Todos',
    mes: 'Todos'
  });

  const [showEsperaAla, setShowEsperaAla] = useState(true);

  // Extract Unique Filter Options
  const options = useMemo(() => {
    const opts = {
        localAdmissao: new Set<string>(['Todos']),
        risco: new Set<string>(['Todos']),
        ala: new Set<string>(['Todos']),
        tipoAla: new Set<string>(['Todos']),
        ano: new Set<string>(['Todos']),
        mes: new Set<string>(['Todos'])
    };

    data.forEach(p => {
        if (p.localAdmissao) opts.localAdmissao.add(p.localAdmissao);
        if (p.riskColor) opts.risco.add(p.riskColor);
        if (p.admissaoAno) opts.ano.add(p.admissaoAno);
        if (p.admissaoMes) opts.mes.add(p.admissaoMes);
        
        p.logs.forEach(l => {
            if (l.ala) opts.ala.add(l.ala);
            if (l.tipoAla) opts.tipoAla.add(l.tipoAla);
        });
    });

    return {
        localAdmissao: Array.from(opts.localAdmissao).sort(),
        risco: Array.from(opts.risco).sort(),
        ala: Array.from(opts.ala).sort(),
        tipoAla: Array.from(opts.tipoAla).sort(),
        ano: Array.from(opts.ano).sort(),
        mes: Array.from(opts.mes).sort(),
    };
  }, [data]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // --- FILTERED DATA ---
  const filteredData = useMemo(() => {
    return data.filter(p => {
        if (filters.localAdmissao !== 'Todos' && p.localAdmissao !== filters.localAdmissao) return false;
        if (filters.risco !== 'Todos' && p.riskColor !== filters.risco) return false;
        if (filters.ano !== 'Todos' && p.admissaoAno !== filters.ano) return false;
        if (filters.mes !== 'Todos' && p.admissaoMes !== filters.mes) return false;
        
        // Log based filters (if selected, patient must have at least one matching log)
        if (filters.ala !== 'Todos') {
            if (!p.logs.some(l => l.ala === filters.ala)) return false;
        }
        if (filters.tipoAla !== 'Todos') {
            if (!p.logs.some(l => l.tipoAla === filters.tipoAla)) return false;
        }

        return true;
    });
  }, [data, filters]);

  // --- KPI CALCULATIONS ---
  const metrics = useMemo(() => {
    let totalPatients = filteredData.length;
    let sumTriageWait = 0;
    let countTriageWait = 0;
    let sumTotalStay = 0;
    let countTotalStay = 0;
    let sumIdleTime = 0;
    let countIdleTime = 0;

    let onlyPSCount = 0;
    let hasInternacaoCount = 0;
    
    // Total Stay aggregators for specific cohorts
    let sumTotalStayOnlyPS = 0;
    let sumTotalStayInternacaoCohort = 0;

    let sumPSStay = 0;
    let countPSStay = 0; // Patients who had ANY PS time

    let sumInternacaoStay = 0;
    let countInternacaoStay = 0;

    let sumWaitBeforeInternacao = 0;
    let countWaitBeforeInternacao = 0;

    filteredData.forEach(p => {
        // 1. Triage Wait
        if (p.triageWaitMinutes > 0) {
            sumTriageWait += p.triageWaitMinutes;
            countTriageWait++;
        }

        // 2. Total Stay (Global)
        if (p.totalStayMinutes > 0) {
            sumTotalStay += p.totalStayMinutes;
            countTotalStay++;
        }

        // 3. Idle Time
        if (p.idleTimeMinutes > 0 && !p.hasDischargeError) {
            sumIdleTime += p.idleTimeMinutes;
            countIdleTime++;
        }

        // Analyze Logs for PS vs Internacao
        let patientHasPS = false;
        let patientHasInternacao = false;
        let psDurationForThisPatient = 0;
        let internacaoDurationForThisPatient = 0;
        
        // Find transition point (first non-PS log)
        let firstInternacaoIndex = -1;

        p.logs.forEach((log, idx) => {
            const isLogPS = isPS(log.tipoAla, log.ala);
            
            if (isLogPS) {
                patientHasPS = true;
                psDurationForThisPatient += log.durationMinutes;
            } else {
                patientHasInternacao = true;
                internacaoDurationForThisPatient += log.durationMinutes;
                if (firstInternacaoIndex === -1) firstInternacaoIndex = idx;
            }
        });

        if (patientHasPS && !patientHasInternacao) {
            onlyPSCount++;
            sumTotalStayOnlyPS += p.totalStayMinutes;
        }

        if (patientHasInternacao) {
            hasInternacaoCount++;
            sumTotalStayInternacaoCohort += p.totalStayMinutes;
        }

        if (patientHasPS) {
            sumPSStay += psDurationForThisPatient;
            countPSStay++;
        }

        if (patientHasInternacao) {
            sumInternacaoStay += internacaoDurationForThisPatient;
            countInternacaoStay++;
        }

        // Time in PS BEFORE Internacao
        if (patientHasInternacao && firstInternacaoIndex > 0) {
            // Sum all logs BEFORE the first internacao log
            let waitTime = 0;
            for (let i = 0; i < firstInternacaoIndex; i++) {
                waitTime += p.logs[i].durationMinutes;
            }
            if (waitTime > 0) {
                sumWaitBeforeInternacao += waitTime;
                countWaitBeforeInternacao++;
            }
        }
    });

    // We round averages here to ensure formatDuration receives integers
    return {
        totalPatients,
        avgTriageWait: Math.round(calculateAverage(sumTriageWait, countTriageWait)),
        avgTotalStay: Math.round(calculateAverage(sumTotalStay, countTotalStay)),
        onlyPSCount,
        hasInternacaoCount,
        
        // New specific averages
        avgTotalStayOnlyPS: Math.round(calculateAverage(sumTotalStayOnlyPS, onlyPSCount)),
        avgTotalStayInternacaoCohort: Math.round(calculateAverage(sumTotalStayInternacaoCohort, hasInternacaoCount)),

        avgPSStay: Math.round(calculateAverage(sumPSStay, countPSStay)),
        avgInternacaoStay: Math.round(calculateAverage(sumInternacaoStay, countInternacaoStay)),
        avgWaitBeforeInternacao: Math.round(calculateAverage(sumWaitBeforeInternacao, countWaitBeforeInternacao)),
        avgIdleTime: Math.round(calculateAverage(sumIdleTime, countIdleTime))
    };
  }, [filteredData]);

  // --- CHARTS DATA ---
  const chartsData = useMemo(() => {
    // 1. Age Distribution (Bins)
    const ageBins = { '0-10': 0, '11-20': 0, '21-40': 0, '41-60': 0, '60+': 0 };
    // 2. Risk Color
    const riskCounts: Record<string, number> = {};
    // 3. Location (Top 10)
    const locCounts: Record<string, number> = {};
    // 4. City
    const cityCounts: Record<string, number> = {};

    filteredData.forEach(p => {
        // Age
        const age = parseInt(p.age);
        if (!isNaN(age)) {
            if (age <= 10) ageBins['0-10']++;
            else if (age <= 20) ageBins['11-20']++;
            else if (age <= 40) ageBins['21-40']++;
            else if (age <= 60) ageBins['41-60']++;
            else ageBins['60+']++;
        }

        // Risk
        riskCounts[p.riskColor || 'N/A'] = (riskCounts[p.riskColor || 'N/A'] || 0) + 1;

        // City
        if (p.municipio) cityCounts[p.municipio] = (cityCounts[p.municipio] || 0) + 1;

        // Locations (from logs) - Count frequency of presence (not duration)
        const visitedLocs = new Set<string>();
        p.logs.forEach(l => visitedLocs.add(l.localizacao));
        visitedLocs.forEach(loc => {
            if (loc && loc !== '-') locCounts[loc] = (locCounts[loc] || 0) + 1;
        });
    });

    // Prepare chart arrays
    
    // Handle Location Filter (Espera de Ala)
    const locData = Object.entries(locCounts)
        .filter(([name]) => showEsperaAla || !name.toLowerCase().includes('espera de ala'))
        .map(([name, value]) => ({ name, value }))
        .sort((a,b) => b.value - a.value)
        .slice(0, 15);

    return {
        ageData: Object.entries(ageBins).map(([name, value]) => ({ name, value })),
        riskData: Object.entries(riskCounts).map(([name, value]) => ({ name, value })),
        locData,
        cityData: Object.entries(cityCounts)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a,b) => b.value - a.value)
                    .slice(0, 10) 
    };
  }, [filteredData, showEsperaAla]);

  // --- RENDER ---
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#12141d]">
        
        {/* FILTERS BAR */}
        <div className="p-4 border-b border-gray-800 bg-[#16181f] overflow-x-auto">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Filter size={12} /> Filtros Globais
            </div>
            <div className="flex gap-3">
                <FilterSelect label="Local Adm." value={filters.localAdmissao} onChange={(v) => handleFilterChange('localAdmissao', v)} options={options.localAdmissao} />
                <FilterSelect label="Risco" value={filters.risco} onChange={(v) => handleFilterChange('risco', v)} options={options.risco} />
                <FilterSelect label="Ala" value={filters.ala} onChange={(v) => handleFilterChange('ala', v)} options={options.ala} />
                <FilterSelect label="Tipo Ala" value={filters.tipoAla} onChange={(v) => handleFilterChange('tipoAla', v)} options={options.tipoAla} />
                <FilterSelect label="Ano" value={filters.ano} onChange={(v) => handleFilterChange('ano', v)} options={options.ano} />
                <FilterSelect label="Mês" value={filters.mes} onChange={(v) => handleFilterChange('mes', v)} options={options.mes} />
            </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* TOP METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard title="Total Pacientes" value={metrics.totalPatients.toString()} icon={Users} color="#3b82f6" subtitle="No período filtrado" />
                <KPICard title="Média Admissão -> Triagem" value={formatDuration(metrics.avgTriageWait)} icon={Timer} color="#f59e0b" subtitle="Tempo de espera inicial" />
                <KPICard title="Média Permanência Total" value={formatDuration(metrics.avgTotalStay)} icon={Clock} color="#00ffa2" subtitle="Entrada -> Saída (Geral)" />
                <KPICard title="Média Ociosidade (Alta)" value={formatDuration(metrics.avgIdleTime)} icon={Activity} color="#ef4444" subtitle="Alta Méd. -> Alta Hosp." />
            </div>

            {/* SECOND METRICS ROW (SPECIFIC) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard 
                    title="Apenas PS" 
                    value={metrics.onlyPSCount.toString()} 
                    icon={Stethoscope} 
                    color="#8b5cf6" 
                    subtitle={`Média Perm: ${formatDuration(metrics.avgTotalStayOnlyPS)}`} 
                />
                <KPICard 
                    title="Com Internação" 
                    value={metrics.hasInternacaoCount.toString()} 
                    icon={Bed} 
                    color="#ec4899" 
                    subtitle={`Média Perm: ${formatDuration(metrics.avgTotalStayInternacaoCohort)}`}
                />
                <KPICard title="Média Tempo em PS" value={formatDuration(metrics.avgPSStay)} icon={Clock} color="#8b5cf6" subtitle="Duração média no PS" />
                <KPICard title="Média Tempo Internado" value={formatDuration(metrics.avgInternacaoStay)} icon={Clock} color="#ec4899" subtitle="Duração fora do PS" />
            </div>

            {/* THIRD ROW (Complex Metrics) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <KPICard 
                    title="Tempo Médio PS antes de Internar" 
                    value={formatDuration(metrics.avgWaitBeforeInternacao)} 
                    icon={Timer} 
                    color="#f59e0b"
                    subtitle="Quanto tempo o paciente aguardou no PS até subir para o leito"
                />
            </div>

            {/* CHARTS SECTION */}
            <h2 className="text-xl font-bold text-white mt-8 mb-4 border-l-4 border-[#00ffa2] pl-3">Análise Demográfica e Localização</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* LOCATION CHART */}
                <div className="p-4 rounded-lg bg-[#1a1c23] border border-gray-800 shadow-lg h-96 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Top 15 Localizações (Frequência)</h3>
                        <button 
                            onClick={() => setShowEsperaAla(!showEsperaAla)}
                            className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${showEsperaAla ? 'bg-[#00ffa2] text-black font-bold' : 'bg-gray-800 text-gray-400'}`}
                        >
                            {showEsperaAla ? <Eye size={12} /> : <EyeOff size={12} />}
                            {showEsperaAla ? 'Ocultar "Espera de Ala"' : 'Mostrar "Espera de Ala"'}
                        </button>
                    </div>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartsData.locData} layout="vertical" margin={{ left: 20, right: 30, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1a1c23', borderColor: '#333' }} />
                                <Bar dataKey="value" fill="#00ffa2" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* RISK CLASSIFICATION */}
                <div className="p-4 rounded-lg bg-[#1a1c23] border border-gray-800 shadow-lg h-96 flex flex-col">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Classificação de Risco</h3>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartsData.riskData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: '#9ca3af' }} />
                                <YAxis tick={{ fill: '#9ca3af' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1a1c23', borderColor: '#333' }} />
                                <Bar dataKey="value">
                                    {chartsData.riskData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getRiskColor(entry.name)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* AGE DISTRIBUTION */}
                <div className="p-4 rounded-lg bg-[#1a1c23] border border-gray-800 shadow-lg h-80">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Faixa Etária</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartsData.ageData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: '#9ca3af' }} />
                            <YAxis tick={{ fill: '#9ca3af' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1c23', borderColor: '#333' }} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                 {/* CITY DISTRIBUTION */}
                 <div className="p-4 rounded-lg bg-[#1a1c23] border border-gray-800 shadow-lg h-80">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Top 10 Municípios</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartsData.cityData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1c23', borderColor: '#333' }} />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </div>
        </div>
    </div>
  );
};

const FilterSelect = ({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: string[] }) => (
    <div className="relative min-w-[140px]">
        <label className="block text-[10px] text-gray-500 font-bold mb-1 uppercase">{label}</label>
        <div className="relative">
            <select 
                value={value} 
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[#0d0e14] border border-gray-700 text-white text-xs rounded py-1.5 pl-2 pr-6 appearance-none focus:border-[#00ffa2] focus:outline-none"
            >
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-2 text-gray-500 pointer-events-none" />
        </div>
    </div>
);
