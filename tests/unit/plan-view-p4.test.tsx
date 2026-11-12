// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanView } from '../../src/renderer/src/plan/PlanView'
import { ReadinessPanel } from '../../src/renderer/src/plan/ReadinessPanel'
import type { SinapsiApi } from '../../src/shared/api'

afterEach(cleanup)
const settings = { studyHours:[3,3,3,3,3,2,1], planBuffer:0.15 } as SinapsiApi['settings'] extends {get():Promise<infer T>} ? T : never
const days = Array.from({length:7},(_,i)=>({date:`2026-11-${String(12+i).padStart(2,'0')}`,minutes:180,bufferMinutes:27,blocks:i===0?[{courseId:'A',minutes:153,kind:'lesson' as const,lessonIds:['lesson-id'],conceptIds:[],reason:'2 digestioni in sospeso',phase:'fondamenta' as const}]:i===1?[{courseId:'B',minutes:153,kind:'exam-sim' as const,lessonIds:[],conceptIds:['c1'],reason:'esame tra 5 giorni',phase:'simulazioni' as const}]:[]}))
function attach(overrides: Partial<SinapsiApi> = {}): void {
  const api = { settings:{get:vi.fn().mockResolvedValue(settings),set:vi.fn().mockResolvedValue(settings)}, plan:{week:vi.fn().mockResolvedValue({plan:{days},readiness:[]})}, lessons:{list:vi.fn().mockResolvedValue([]),launch:vi.fn().mockResolvedValue({view:'review',conceptIds:['c1']})}, ...overrides }
  Object.defineProperty(window,'sinapsi',{configurable:true,value:api})
}

describe('PlanView', () => {
  it('renders seven days and launches the first lesson', async () => {
    attach()
    const onLaunched=vi.fn()
    render(<PlanView onBack={vi.fn()} onOpenPracticeSetup={vi.fn()} onLaunched={onLaunched}/> )
    expect(await screen.findByText('Piano della settimana')).toBeTruthy()
    await waitFor(()=>expect(screen.getAllByRole('heading',{level:2}).length).toBeGreaterThanOrEqual(8))
    fireEvent.click(screen.getByRole('button',{name:'Avvia lezione'}))
    await waitFor(()=>expect(window.sinapsi.lessons.launch).toHaveBeenCalledWith('lesson-id'))
    await waitFor(()=>expect(onLaunched).toHaveBeenCalledWith({view:'review',conceptIds:['c1']}))
  })

  it('routes exam simulation blocks to practice setup with exam enabled', async () => {
    attach()
    const open=vi.fn()
    render(<PlanView onBack={vi.fn()} onOpenPracticeSetup={open} onLaunched={vi.fn()}/> )
    fireEvent.click(await screen.findByRole('button',{name:'Avvia simulazione'}))
    expect(open).toHaveBeenCalledWith(['c1'],true)
  })
})

describe('ReadinessPanel', () => {
  it('shows null signals as da misurare', () => {
    render(<ReadinessPanel items={[{examId:'e',courseId:'A',daysLeft:4,score:null,status:'da misurare',signals:[{key:'papers',label:'Simulazioni senza aiuti',value:null,detail:'Nessuna simulazione recente'}]}]}/> )
    expect(screen.getAllByText('da misurare').length).toBeGreaterThan(0)
  })
})
