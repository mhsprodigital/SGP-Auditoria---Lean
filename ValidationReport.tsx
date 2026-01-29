import React, { useState } from 'react';
import { AlertTriangle, X, ClipboardList, CheckCircle } from 'lucide-react';

export interface ValidationError {
  id: string;
  type: 'DUPLICATE' | 'INCONSISTENCY' | 'CHRONOLOGY';
  patient: string;
  passagem: string;
  message: string;
}

interface ValidationReportProps {
  errors: ValidationError[];
}

export const ValidationReport: React.FC<ValidationReportProps> = ({ errors }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!errors || errors.length === 0) return null;

  return (
    <>
      {/* Floating Button Indicator */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 animate-bounce-subtle"
        title="Ver Relatório de Inconsistências"
        style={{ boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.39)' }}
      >
        <AlertTriangle size={24} />
        <span className="font-bold bg-white text-red-500 rounded-full w-6 h-6 flex items-center justify-center text-xs">
          {errors.length}
        </span>
      </button>

      {/* Modal/Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a1c23] border border-gray-700 w-full max-w-3xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-[#12141d]">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <ClipboardList className="text-red-500" />
                  Relatório de Inconsistências
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  Erros detectados na planilha original que precisam de atenção.
                </p>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#16181f]">
              <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-lg text-sm text-blue-200 mb-6 flex items-start gap-3">
                <CheckCircle className="text-blue-500 mt-0.5 flex-shrink-0" size={16} />
                <div>
                  <strong>Dica:</strong> Use os IDs de Passagem listados abaixo para localizar os registros problemáticos no seu sistema original.
                  Registros duplicados foram ignorados nos gráficos para não afetar os cálculos.
                </div>
              </div>
            
              {errors.map((err) => (
                <div 
                  key={err.id} 
                  className="bg-[#1a1c23] p-4 rounded-lg border border-l-4 hover:border-r-gray-600 transition-all"
                  style={{ 
                    borderLeftColor: err.type === 'DUPLICATE' ? '#f59e0b' : '#ef4444',
                    borderColor: '#2d3748'
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span 
                          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded" 
                          style={{ 
                            backgroundColor: err.type === 'DUPLICATE' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: err.type === 'DUPLICATE' ? '#f59e0b' : '#ef4444' 
                          }}
                        >
                          {err.type === 'DUPLICATE' ? 'Linha Duplicada' : 'Erro de Soma'}
                        </span>
                        <span className="text-gray-500 text-xs font-mono">Passagem: {err.passagem}</span>
                      </div>
                      
                      <div className="font-bold text-white text-lg">{err.patient}</div>
                      <div className="text-sm text-gray-400 mt-1 leading-relaxed">{err.message}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-[#12141d] flex justify-end">
              <button 
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
