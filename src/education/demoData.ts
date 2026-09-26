export type DemoClass = {
  id: string
  name: string
  subject: string
  period: string
  joinCode: string
  teacherName: string
  studentCount: number
}

export type DemoAssignment = {
  id: string
  classId: string
  title: string
  /** Pedagogical note shown at the top — insight for teachers. */
  teacherTakeaway?: string
  topic: string
  aiPosition: string
  studentTask: string
  dueLabel: string
  maxPoints: number
  status: 'open' | 'closed'
}

export type DebateInsights = {
  fillerWords: number
  fillerBreakdown: { word: string; count: number }[]
  wordsPerMinute: number
  emotionConveyed: string
  emotionNotes: string
  proveWrongScore: number
  maxPoints: number
  outcomeLabel: string
  talkListenRatio: string
}

export type DemoStudent = {
  id: string
  name: string
  classId: string
  totalPoints: number
}

export type DemoSubmission = {
  studentId: string
  assignmentId: string
  status: 'not_started' | 'in_progress' | 'submitted'
  points?: number
  insights?: DebateInsights
  /** Debate tries for this assignment (0 if not started). */
  attempts: number
  /** Set when status is submitted — prove-me-wrong threshold met or not. */
  passed?: boolean
}

export const DEMO_TEACHER = {
  name: 'Jordan Rivera',
  school: 'Lincoln High School',
}

export const DEMO_CLASSES: DemoClass[] = [
  {
    id: 'cls-gov',
    name: 'AP Government',
    subject: 'Social studies',
    period: 'Period 2',
    joinCode: 'GOVT-7K2M',
    teacherName: DEMO_TEACHER.name,
    studentCount: 28,
  },
  {
    id: 'cls-eng',
    name: 'English 10B',
    subject: 'English',
    period: 'Block C',
    joinCode: 'ENGL-4821',
    teacherName: DEMO_TEACHER.name,
    studentCount: 24,
  },
  {
    id: 'cls-hist',
    name: 'World history honors',
    subject: 'Social studies',
    period: 'Period 5',
    joinCode: 'HIST-3Q9P',
    teacherName: DEMO_TEACHER.name,
    studentCount: 22,
  },
]

export const DEMO_ASSIGNMENTS: DemoAssignment[] = [
  {
    id: 'asgn-1',
    classId: 'cls-gov',
    title: 'Homework: Electoral college',
    teacherTakeaway:
      'Listen for whether students defend federalism on principle or only as partisan convenience — that gap is the learning goal.',
    topic: 'The electoral college should be replaced by a national popular vote.',
    aiPosition:
      'The electoral college protects smaller states and stabilizes close national elections.',
    studentTask: 'Prove the AI wrong using evidence, civility, and clear reasoning.',
    dueLabel: 'Due Mon, Sep 29',
    maxPoints: 100,
    status: 'open',
  },
  {
    id: 'asgn-2',
    classId: 'cls-gov',
    title: 'In-class follow-up: Gerrymandering',
    teacherTakeaway:
      'Strong responses name a concrete tradeoff between accountability and fairness instead of only attacking “politicians.”',
    topic: 'Independent redistricting commissions should draw all congressional maps.',
    aiPosition:
      'Elected legislatures should retain map-drawing power because voters can hold them accountable.',
    studentTask: 'Shift the AI’s position or earn partial credit for strong tradeoff analysis.',
    dueLabel: 'Due Wed, Oct 1',
    maxPoints: 80,
    status: 'open',
  },
  {
    id: 'asgn-3',
    classId: 'cls-eng',
    title: 'Prove me wrong: AI in the classroom',
    teacherTakeaway:
      'Watch for students who redefine “writing” mid-debate — that move often reveals their real stance on authorship.',
    topic: 'Schools should ban generative AI for all student writing assignments.',
    aiPosition:
      'Thoughtful AI use teaches revision, research habits, and digital literacy when policies are clear.',
    studentTask: 'Argue the opposite side and aim for a full “proved wrong” outcome.',
    dueLabel: 'Due Fri, Oct 3',
    maxPoints: 100,
    status: 'open',
  },
  {
    id: 'asgn-4',
    classId: 'cls-eng',
    title: 'Summer reading debate',
    teacherTakeaway:
      'Note who cites belonging vs. who cites personal freedom — both are valid frames for a follow-up discussion.',
    topic: 'Required summer reading lists do more harm than good for student engagement.',
    aiPosition:
      'Shared texts build classroom community and equalize background knowledge in September.',
    studentTask: 'Complete one 3-minute voice debate; insights count toward participation.',
    dueLabel: 'Closed',
    maxPoints: 60,
    status: 'closed',
  },
  {
    id: 'asgn-5',
    classId: 'cls-hist',
    title: 'Cold War homework',
    teacherTakeaway:
      'The best attempts distinguish strategy from morality — push students who conflate the two.',
    topic: 'Containment was the most effective U.S. strategy during the Cold War.',
    aiPosition:
      'Containment unnecessarily prolonged conflict; diplomacy and trade would have reduced risk.',
    studentTask: 'Use primary-source style reasoning; filler-word report is shared with you.',
    dueLabel: 'Due Thu, Oct 2',
    maxPoints: 90,
    status: 'open',
  },
]

export const DEMO_STUDENTS: DemoStudent[] = [
  { id: 'stu-alex', name: 'Alex Chen', classId: 'cls-gov', totalPoints: 186 },
  { id: 'stu-maya', name: 'Maya Ortiz', classId: 'cls-gov', totalPoints: 172 },
  { id: 'stu-sam', name: 'Sam Okonkwo', classId: 'cls-gov', totalPoints: 94 },
  { id: 'stu-jordan', name: 'Jordan Lee', classId: 'cls-eng', totalPoints: 140 },
  { id: 'stu-priya', name: 'Priya Nair', classId: 'cls-eng', totalPoints: 210 },
  { id: 'stu-demo', name: 'You', classId: 'cls-gov', totalPoints: 0 },
]

const SAMPLE_INSIGHTS: DebateInsights = {
  fillerWords: 19,
  fillerBreakdown: [
    { word: 'like', count: 8 },
    { word: 'um', count: 6 },
    { word: 'you know', count: 3 },
    { word: 'sort of', count: 2 },
  ],
  wordsPerMinute: 138,
  emotionConveyed: 'Calm conviction',
  emotionNotes:
    'You stayed even-toned under pushback and sounded more confident in the second half of the debate.',
  proveWrongScore: 82,
  maxPoints: 100,
  outcomeLabel: 'Proved wrong — strong shift',
  talkListenRatio: '58% speaking / 42% listening',
}

export const DEMO_SUBMISSIONS: DemoSubmission[] = [
  {
    studentId: 'stu-alex',
    assignmentId: 'asgn-1',
    status: 'submitted',
    points: 88,
    attempts: 1,
    passed: true,
    insights: { ...SAMPLE_INSIGHTS, proveWrongScore: 88, fillerWords: 14 },
  },
  {
    studentId: 'stu-maya',
    assignmentId: 'asgn-1',
    status: 'submitted',
    points: 76,
    attempts: 3,
    passed: false,
    insights: {
      ...SAMPLE_INSIGHTS,
      proveWrongScore: 76,
      fillerWords: 27,
      emotionConveyed: 'Passionate, slightly rushed',
      outcomeLabel: 'Partial shift — did not prove wrong',
    },
  },
  {
    studentId: 'stu-sam',
    assignmentId: 'asgn-1',
    status: 'submitted',
    points: 52,
    attempts: 2,
    passed: false,
    insights: {
      ...SAMPLE_INSIGHTS,
      proveWrongScore: 52,
      fillerWords: 31,
      emotionConveyed: 'Uncertain',
      outcomeLabel: 'AI held its ground',
    },
  },
  { studentId: 'stu-demo', assignmentId: 'asgn-1', status: 'not_started', attempts: 0 },
  { studentId: 'stu-demo', assignmentId: 'asgn-2', status: 'not_started', attempts: 0 },
  {
    studentId: 'stu-alex',
    assignmentId: 'asgn-2',
    status: 'in_progress',
    attempts: 1,
  },
  {
    studentId: 'stu-jordan',
    assignmentId: 'asgn-3',
    status: 'submitted',
    points: 91,
    attempts: 1,
    passed: true,
    insights: SAMPLE_INSIGHTS,
  },
]

export function findClassByJoinCode(code: string): DemoClass | undefined {
  const normalized = code.trim().toUpperCase()
  return DEMO_CLASSES.find((c) => c.joinCode === normalized)
}

const LOCAL_ASN_KEY = 'cg-edu-local-assignments'

export function readLocalAssignments(): DemoAssignment[] {
  try {
    const raw = sessionStorage.getItem(LOCAL_ASN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DemoAssignment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendLocalAssignment(assignment: DemoAssignment) {
  const all = [...readLocalAssignments(), assignment]
  sessionStorage.setItem(LOCAL_ASN_KEY, JSON.stringify(all))
}

export function allAssignments(): DemoAssignment[] {
  return [...DEMO_ASSIGNMENTS, ...readLocalAssignments()]
}

export function openAssignmentCount(): number {
  return allAssignments().filter((a) => a.status === 'open').length
}

export function findAssignment(id: string): DemoAssignment | undefined {
  return allAssignments().find((a) => a.id === id)
}

export function assignmentsForClass(classId: string): DemoAssignment[] {
  return allAssignments().filter((a) => a.classId === classId)
}

export function studentsForClass(classId: string): DemoStudent[] {
  return DEMO_STUDENTS.filter((s) => s.classId === classId)
}

export function submissionFor(studentId: string, assignmentId: string): DemoSubmission | undefined {
  return DEMO_SUBMISSIONS.find((s) => s.studentId === studentId && s.assignmentId === assignmentId)
}

export function submissionOrDefault(studentId: string, assignmentId: string): DemoSubmission {
  return (
    submissionFor(studentId, assignmentId) ?? {
      studentId,
      assignmentId,
      status: 'not_started',
      attempts: 0,
    }
  )
}

export function submissionsForAssignment(assignmentId: string): DemoSubmission[] {
  return DEMO_SUBMISSIONS.filter((s) => s.assignmentId === assignmentId)
}

export function studentAssignmentRows(classId: string, studentId: string) {
  return assignmentsForClass(classId).map((assignment) => ({
    assignment,
    sub: submissionOrDefault(studentId, assignment.id),
  }))
}

export function demoInsightsAfterDebate(maxPoints: number): DebateInsights {
  return {
    ...SAMPLE_INSIGHTS,
    maxPoints,
    proveWrongScore: Math.min(maxPoints, 84),
  }
}
