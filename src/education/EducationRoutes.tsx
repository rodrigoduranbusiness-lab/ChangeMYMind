import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'

import FillerChart from '../components/FillerChart'
import {
  DEMO_CLASSES,
  DEMO_STUDENTS,
  DEMO_TEACHER,
  type DemoAssignment,
  type DebateInsights,
  appendLocalAssignment,
  assignmentsForClass,
  demoInsightsAfterDebate,
  findAssignment,
  findClassByJoinCode,
  openAssignmentCount,
  studentAssignmentRows,
  studentsForClass,
  submissionFor,
  submissionOrDefault,
  type DemoSubmission,
} from './demoData'
import {
  EduStat,
  EducationShell,
  TitleMetaDot,
  TitleMetaItem,
  TitleMetaLink,
  eduRow,
  eduSectionTitle,
  eduStatGrid,
} from './EducationShell'
import * as s from '../theme'

const STUDENT_KEY = 'cg-edu-demo-student'
const CLASS_KEY = 'cg-edu-demo-class'

function readStoredClassId(): string | null {
  try {
    return sessionStorage.getItem(CLASS_KEY)
  } catch {
    return null
  }
}

function storeJoin(classId: string, studentId: string) {
  try {
    sessionStorage.setItem(CLASS_KEY, classId)
    sessionStorage.setItem(STUDENT_KEY, studentId)
  } catch {
    /* demo */
  }
}

export function EducationHome() {
  return (
    <EducationShell
      title="Common Ground for education"
      subtitle="Teachers assign prove-me-wrong debates on any topic. Students earn points when they shift the AI, plus speaking insights after each session."
    >
      <p style={{ ...s.kicker, marginBottom: 24 }}>
        {DEMO_TEACHER.school}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
        <Link to="/education/teacher" style={{ ...eduRow, ...s.buttonPrimary, color: s.color.accentText }}>
          Teacher dashboard
        </Link>
        <Link to="/education/student" style={eduRow}>
          Student — join a class
        </Link>
      </div>

      <Link to="/" style={{ display: 'inline-block', marginTop: 32, fontSize: 14, color: s.color.textMuted }}>
        ← Back to sign in
      </Link>
    </EducationShell>
  )
}

export function TeacherDashboard() {
  return (
    <EducationShell
      title="Teacher dashboard"
      subtitle={`${DEMO_TEACHER.name} · ${DEMO_TEACHER.school}`}
      backTo="/education"
      backLabel="Education home"
    >
      <div style={eduStatGrid}>
        <EduStat label="Classes" value={String(DEMO_CLASSES.length)} />
        <EduStat label="Open assignments" value={String(openAssignmentCount())} />
        <EduStat label="Students" value={String(DEMO_STUDENTS.length)} />
      </div>

      <h2 style={eduSectionTitle}>Your classes</h2>
      {DEMO_CLASSES.map((cls) => (
        <Link key={cls.id} to={`/education/teacher/class/${cls.id}`} style={eduRow}>
          <div style={{ fontWeight: 600 }}>{cls.name}</div>
          <div style={{ fontSize: 13, color: s.color.textMuted, marginTop: 4 }}>
            {cls.period} · Join code {cls.joinCode} · {cls.studentCount} students
          </div>
        </Link>
      ))}
    </EducationShell>
  )
}

function passFailLabel(sub: DemoSubmission): string {
  if (sub.status === 'not_started') return 'Not started'
  if (sub.status === 'in_progress') return 'In progress'
  if (sub.passed) return 'Pass'
  return 'Fail'
}

function passFailColor(sub: DemoSubmission): string {
  if (sub.status !== 'submitted') return s.color.textMuted
  return sub.passed ? s.color.win : s.color.lose
}

function InsightsBlock({ insights }: { insights: DebateInsights }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ ...eduSectionTitle, fontSize: 15 }}>Speaking insights</h3>
      <div style={eduStatGrid}>
        <EduStat label="Prove-wrong score" value={`${insights.proveWrongScore} / ${insights.maxPoints}`} />
        <EduStat label="Filler words" value={String(insights.fillerWords)} />
        <EduStat label="Pace" value={`${insights.wordsPerMinute} wpm`} />
        <EduStat label="Emotion conveyed" value={insights.emotionConveyed} />
      </div>
      <p style={{ ...s.subheading, fontSize: 14 }}>{insights.emotionNotes}</p>
      <p style={{ ...s.subheading, fontSize: 14, color: s.color.textMuted }}>
        {insights.talkListenRatio} · Outcome: {insights.outcomeLabel}
      </p>
      <h4 style={{ ...eduSectionTitle, fontSize: 15, marginTop: 16 }}>Filler breakdown</h4>
      <FillerChart rows={insights.fillerBreakdown} />
    </div>
  )
}

function TeacherStudentSubmission({
  studentName,
  assignmentTitle,
  sub,
}: {
  studentName: string
  assignmentTitle: string
  sub: DemoSubmission
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '16px 18px',
        border: `1px solid ${s.color.borderStrong}`,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>{studentName}</div>
      <p style={{ ...s.subheading, fontSize: 13, margin: '0 0 14px' }}>{assignmentTitle}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: 15, marginBottom: 12 }}>
        <span>
          <span style={{ color: s.color.textMuted }}>Attempts </span>
          {sub.attempts}
        </span>
        <span>
          <span style={{ color: s.color.textMuted }}>Result </span>
          <span style={{ color: passFailColor(sub), fontWeight: 600 }}>{passFailLabel(sub)}</span>
        </span>
        {sub.status === 'submitted' && sub.points != null && (
          <span>
            <span style={{ color: s.color.textMuted }}>Score </span>
            {sub.points} pts
          </span>
        )}
      </div>
      {sub.status === 'submitted' && sub.insights ? (
        <InsightsBlock insights={sub.insights} />
      ) : sub.status === 'in_progress' ? (
        <p style={{ ...s.subheading, fontSize: 14, margin: 0 }}>
          Started but not submitted — {sub.attempts} attempt{sub.attempts === 1 ? '' : 's'} so far.
        </p>
      ) : (
        <p style={{ ...s.subheading, fontSize: 14, margin: 0 }}>No submission yet.</p>
      )}
    </div>
  )
}

function classBasePath(classId: string) {
  return `/education/teacher/class/${classId}`
}

function ClassNotFound() {
  return (
    <EducationShell title="Class not found" backTo="/education/teacher">
      <Link to="/education/teacher" style={s.buttonPrimary}>
        Back to dashboard
      </Link>
    </EducationShell>
  )
}

function ClassNav({ base }: { base: string }) {
  const tabStyle = (active: boolean) => ({
    fontSize: 15,
    fontFamily: s.font.serif,
    color: active ? s.color.text : s.color.textMuted,
    textDecoration: active ? 'underline' : 'none',
    textUnderlineOffset: 4,
  })

  return (
    <nav style={{ display: 'flex', gap: 22, marginBottom: 24 }}>
      <NavLink to={base} end style={({ isActive }) => tabStyle(isActive)}>
        Assignments
      </NavLink>
      <NavLink to={`${base}/students`} style={({ isActive }) => tabStyle(isActive)}>
        Students
      </NavLink>
    </nav>
  )
}

export function TeacherClassLayout() {
  const { classId } = useParams<{ classId: string }>()
  const cls = DEMO_CLASSES.find((c) => c.id === classId)
  const assignments = useMemo(
    () => (classId ? assignmentsForClass(classId) : []),
    [classId],
  )

  if (!cls || !classId) {
    return <ClassNotFound />
  }

  const base = classBasePath(classId)

  return (
    <EducationShell
      title={cls.name}
      subtitle={`${cls.subject} · ${cls.period}`}
      backTo="/education/teacher"
      backLabel="All classes"
      titleAside={
        <>
          <TitleMetaDot />
          <TitleMetaItem label="Join code" value={cls.joinCode} />
          <TitleMetaDot />
          <TitleMetaLink
            label="Students"
            value={String(cls.studentCount)}
            to={`${base}/students`}
          />
          <TitleMetaDot />
          <TitleMetaLink label="Assignments" value={String(assignments.length)} to={base} />
        </>
      }
    >
      <ClassNav base={base} />
      <Outlet />
    </EducationShell>
  )
}

export function TeacherClassAssignments() {
  const { classId } = useParams<{ classId: string }>()
  const cls = DEMO_CLASSES.find((c) => c.id === classId)
  const [, bump] = useState(0)
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [aiPosition, setAiPosition] = useState('')
  const [teacherTakeaway, setTeacherTakeaway] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const assignments = useMemo(() => {
    if (!classId) return []
    return assignmentsForClass(classId)
  }, [classId, bump])

  if (!cls || !classId) {
    return null
  }

  const base = classBasePath(classId)
  const roster = studentsForClass(cls.id)

  function createAssignment(event: React.FormEvent) {
    event.preventDefault()
    if (!classId || !topic.trim()) return
    const next: DemoAssignment = {
      id: `local-${Date.now()}`,
      classId,
      title: title.trim() || 'New prove-me-wrong debate',
      teacherTakeaway:
        teacherTakeaway.trim() || 'An insight for teachers — what to listen for in student arguments.',
      topic: topic.trim(),
      aiPosition: aiPosition.trim() || 'The AI will argue the opposing view you assign.',
      studentTask: 'Prove the AI wrong in a voice debate. Points for shifting its position.',
      dueLabel: 'Due next week',
      maxPoints: 100,
      status: 'open',
    }
    appendLocalAssignment(next)
    bump((n) => n + 1)
    setTopic('')
    setTitle('')
    setAiPosition('')
    setTeacherTakeaway('')
    setShowForm(false)
  }

  return (
    <>
      {assignments.map((a) => {
        const open = expandedId === a.id
        return (
          <div key={a.id} style={{ marginBottom: 8, border: `1px solid ${s.color.border}` }}>
            <button
              type="button"
              onClick={() => setExpandedId((prev) => (prev === a.id ? null : a.id))}
              aria-expanded={open}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                border: 'none',
                background: 'transparent',
                color: s.color.text,
                fontFamily: s.font.serif,
                fontSize: 16,
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span>{a.title}</span>
              <span style={{ fontSize: 13, fontWeight: 400, color: s.color.textMuted, flexShrink: 0 }}>
                {open ? '−' : '+'} · {a.dueLabel}
              </span>
            </button>

            {open && (
              <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${s.color.border}` }}>
                {a.teacherTakeaway ? (
                  <p style={{ ...s.subheading, fontSize: 14, margin: '14px 0 12px', color: s.color.text }}>
                    <span style={{ color: s.color.textMuted }}>Takeaway: </span>
                    {a.teacherTakeaway}
                  </p>
                ) : null}
                <p style={{ ...s.subheading, fontSize: 14, margin: '0 0 8px' }}>{a.topic}</p>
                <p style={{ ...s.subheading, fontSize: 13, margin: '0 0 14px', color: s.color.textFaint }}>
                  AI argues: {a.aiPosition}
                </p>

                <div style={{ fontSize: 13, color: s.color.textMuted, marginBottom: 8 }}>Students</div>
                {roster.map((st) => {
                  const sub = submissionOrDefault(st.id, a.id)
                  return (
                    <Link
                      key={st.id}
                      to={`${base}/assignments/${a.id}/students/${st.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 0',
                        borderTop: `1px solid ${s.color.border}`,
                        color: s.color.text,
                        fontFamily: s.font.serif,
                        fontSize: 15,
                        textDecoration: 'none',
                      }}
                    >
                      <span>{st.name}</span>
                      <span style={{ fontSize: 13, color: s.color.textMuted, textAlign: 'right' }}>
                        {sub.attempts} attempt{sub.attempts === 1 ? '' : 's'} ·{' '}
                        <span style={{ color: passFailColor(sub) }}>{passFailLabel(sub)}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {!showForm ? (
        <button type="button" onClick={() => setShowForm(true)} style={{ ...s.buttonSecondary, marginTop: 8 }}>
          Assign new debate
        </button>
      ) : (
        <form onSubmit={createAssignment} style={{ marginTop: 16, maxWidth: 560 }}>
          <h3 style={{ ...eduSectionTitle, marginTop: 0 }}>New assignment</h3>
          <label htmlFor="edu-takeaway" style={s.label}>
            Takeaway (insight for teachers)
          </label>
          <textarea
            id="edu-takeaway"
            value={teacherTakeaway}
            onChange={(e) => setTeacherTakeaway(e.target.value)}
            rows={2}
            placeholder="What should you listen for while students debate?"
            style={{
              ...s.input,
              marginBottom: 12,
              fontSize: 15,
              resize: 'vertical',
              minHeight: 72,
            }}
          />
          <label htmlFor="edu-title" style={s.label}>
            Title
          </label>
          <input
            id="edu-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Homework: Climate policy"
            style={{ ...s.input, marginBottom: 12, fontSize: 15 }}
          />
          <label htmlFor="edu-topic" style={s.label}>
            Topic / resolution
          </label>
          <textarea
            id="edu-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            rows={3}
            placeholder="Resolved: …"
            style={{
              ...s.input,
              marginBottom: 12,
              fontSize: 15,
              resize: 'vertical',
              minHeight: 88,
            }}
          />
          <label htmlFor="edu-ai" style={s.label}>
            AI position (what students must prove wrong)
          </label>
          <textarea
            id="edu-ai"
            value={aiPosition}
            onChange={(e) => setAiPosition(e.target.value)}
            rows={2}
            style={{
              ...s.input,
              marginBottom: 16,
              fontSize: 15,
              resize: 'vertical',
              minHeight: 72,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="submit" style={s.buttonPrimary}>
              Publish to class
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={s.buttonSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  )
}

export function TeacherClassRoster() {
  const { classId } = useParams<{ classId: string }>()
  const cls = DEMO_CLASSES.find((c) => c.id === classId)

  if (!cls || !classId) {
    return null
  }

  const base = classBasePath(classId)
  const roster = studentsForClass(cls.id)

  return (
    <>
      <p style={{ ...s.subheading, fontSize: 14, marginTop: 0, marginBottom: 16 }}>
        Open a student to see their assignments, attempts, and speaking insights.
      </p>
      {roster.map((st) => (
        <Link
          key={st.id}
          to={`${base}/students/${st.id}`}
          style={{
            ...eduRow,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600 }}>{st.name}</span>
          <span style={{ fontSize: 13, color: s.color.textMuted }}>{st.totalPoints} pts total</span>
        </Link>
      ))}
    </>
  )
}

export function TeacherClassStudentDetail() {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>()
  const cls = DEMO_CLASSES.find((c) => c.id === classId)
  const student = DEMO_STUDENTS.find((st) => st.id === studentId)

  if (!cls || !classId || !studentId) {
    return <ClassNotFound />
  }

  if (!student) {
    return (
      <>
        <p style={{ ...s.subheading, marginBottom: 16 }}>That student is not on this roster.</p>
        <Link to={`${classBasePath(classId)}/students`} style={s.buttonSecondary}>
          Back to roster
        </Link>
      </>
    )
  }

  const base = classBasePath(classId)
  const rows = studentAssignmentRows(classId, studentId)

  return (
    <>
      <Link
        to={`${base}/students`}
        style={{ display: 'inline-block', marginBottom: 16, fontSize: 14, color: s.color.textMuted }}
      >
        ← Roster
      </Link>
      <h2 style={{ ...eduSectionTitle, marginTop: 0 }}>{student.name}</h2>
      <p style={{ ...s.subheading, fontSize: 14, marginBottom: 20 }}>{student.totalPoints} points total</p>
      {rows.map(({ assignment, sub }) => (
        <Link
          key={assignment.id}
          to={`${base}/assignments/${assignment.id}/students/${studentId}`}
          style={{
            ...eduRow,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{assignment.title}</span>
          <span style={{ fontSize: 13, color: s.color.textMuted, textAlign: 'right' }}>
            {sub.attempts} attempt{sub.attempts === 1 ? '' : 's'} ·{' '}
            <span style={{ color: passFailColor(sub) }}>{passFailLabel(sub)}</span>
          </span>
        </Link>
      ))}
    </>
  )
}

export function TeacherClassSubmission() {
  const { classId, assignmentId, studentId } = useParams<{
    classId: string
    assignmentId: string
    studentId: string
  }>()

  const cls = DEMO_CLASSES.find((c) => c.id === classId)
  const student = DEMO_STUDENTS.find((st) => st.id === studentId)
  const assignment = assignmentId ? findAssignment(assignmentId) : undefined

  if (!cls || !classId || !studentId || !assignmentId) {
    return <ClassNotFound />
  }

  if (!student || !assignment || assignment.classId !== classId) {
    return (
      <>
        <p style={{ ...s.subheading, marginBottom: 16 }}>That submission could not be found.</p>
        <Link to={classBasePath(classId)} style={s.buttonSecondary}>
          Back to assignments
        </Link>
      </>
    )
  }

  const base = classBasePath(classId)
  const sub = submissionOrDefault(studentId, assignmentId)

  return (
    <>
      <Link
        to={`${base}/students/${studentId}`}
        style={{ display: 'inline-block', marginBottom: 16, fontSize: 14, color: s.color.textMuted }}
      >
        ← {student.name}
      </Link>
      <TeacherStudentSubmission
        studentName={student.name}
        assignmentTitle={assignment.title}
        sub={sub}
      />
    </>
  )
}

export function StudentJoin() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function join(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const cls = findClassByJoinCode(code)
    if (!cls) {
      setError('That join code was not recognized. Check the code and try again.')
      return
    }
    storeJoin(cls.id, 'stu-demo')
    navigate('/education/student/home')
  }

  return (
    <EducationShell
      title="Join your class"
      subtitle="Enter the code your teacher shared."
      backTo="/education"
      backLabel="Education home"
    >
      <form onSubmit={join} style={{ maxWidth: 400 }}>
        <label htmlFor="join-code" style={s.label}>
          Join code
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="GOVT-7K2M"
          style={{ ...s.input, fontSize: 16, letterSpacing: '0.06em', marginBottom: 12 }}
        />
        {error && <div style={{ ...s.errorBox, marginBottom: 12 }}>{error}</div>}
        <button type="submit" style={s.buttonPrimary}>
          Join class
        </button>
      </form>
    </EducationShell>
  )
}

export function StudentHome() {
  const navigate = useNavigate()
  const classId = readStoredClassId()
  const cls = DEMO_CLASSES.find((c) => c.id === classId)
  const studentId = (() => {
    try {
      return sessionStorage.getItem(STUDENT_KEY) ?? 'stu-demo'
    } catch {
      return 'stu-demo'
    }
  })()
  const student = DEMO_STUDENTS.find((st) => st.id === studentId)

  if (!cls) {
    return (
      <EducationShell title="No class joined" backTo="/education/student">
        <Link to="/education/student" style={s.buttonPrimary}>
          Enter join code
        </Link>
      </EducationShell>
    )
  }

  const assignments = assignmentsForClass(cls.id).filter((a) => a.status === 'open')

  return (
    <EducationShell
      title={cls.name}
      subtitle={`${student?.name ?? 'Student'} · ${cls.joinCode}`}
      backTo="/education/student"
      backLabel="Switch class"
    >
      <div style={eduStatGrid}>
        <EduStat label="Your points" value={String(student?.totalPoints ?? 0)} />
        <EduStat label="Open debates" value={String(assignments.length)} />
      </div>

      <h2 style={eduSectionTitle}>Homework debates</h2>
      {assignments.map((a) => {
        const sub = submissionFor(studentId, a.id)
        return (
          <Link
            key={a.id}
            to={`/education/student/assignment/${a.id}`}
            style={eduRow}
          >
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            <div style={{ fontSize: 13, color: s.color.textMuted, marginTop: 4 }}>
              {a.dueLabel} · {a.maxPoints} pts ·{' '}
              {sub?.status === 'submitted' ? `Scored ${sub.points} pts` : 'Not started'}
            </div>
          </Link>
        )
      })}

      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(CLASS_KEY)
            sessionStorage.removeItem(STUDENT_KEY)
          } catch {
            /* demo */
          }
          navigate('/education/student')
        }}
        style={{ ...s.buttonSecondary, marginTop: 20 }}
      >
        Leave class
      </button>
    </EducationShell>
  )
}

export function StudentAssignment() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const navigate = useNavigate()
  const assignment = assignmentId ? findAssignment(assignmentId) : undefined
  const studentId = (() => {
    try {
      return sessionStorage.getItem(STUDENT_KEY) ?? 'stu-demo'
    } catch {
      return 'stu-demo'
    }
  })()
  const [completed, setCompleted] = useState(false)
  const [insights, setInsights] = useState<DebateInsights | null>(null)

  const existing = assignmentId ? submissionFor(studentId, assignmentId) : undefined

  if (!assignment) {
    return (
      <EducationShell title="Assignment not found" backTo="/education/student/home">
        <Link to="/education/student/home" style={s.buttonPrimary}>
          Back to class
        </Link>
      </EducationShell>
    )
  }

  const maxPoints = assignment.maxPoints

  function runDemoDebate() {
    const result = demoInsightsAfterDebate(maxPoints)
    setInsights(result)
    setCompleted(true)
  }

  const showInsights = insights ?? existing?.insights
  const submitted = completed || existing?.status === 'submitted'

  return (
    <EducationShell
      title={assignment.title}
      subtitle={assignment.dueLabel}
      backTo="/education/student/home"
      backLabel="Class home"
    >
      {assignment.teacherTakeaway ? (
        <p style={{ ...s.subheading, fontSize: 15, margin: '0 0 20px', color: s.color.text }}>
          <span style={{ color: s.color.textMuted }}>Takeaway: </span>
          {assignment.teacherTakeaway}
        </p>
      ) : null}
      <p style={{ ...s.heading, fontSize: 18, fontWeight: 500, lineHeight: 1.45, marginBottom: 16 }}>
        {assignment.topic}
      </p>
      <p style={{ ...s.subheading, fontSize: 14, marginBottom: 8 }}>
        <span style={{ color: s.color.textMuted }}>AI position: </span>
        {assignment.aiPosition}
      </p>
      <p style={{ ...s.subheading, fontSize: 14, marginBottom: 24 }}>{assignment.studentTask}</p>

      {!submitted ? (
        <button type="button" onClick={runDemoDebate} style={s.buttonPrimary}>
          Start prove-me-wrong debate
        </button>
      ) : (
        <>
          <p style={{ ...s.kicker, marginBottom: 8 }}>
            +{showInsights?.proveWrongScore ?? existing?.points ?? 0} points toward your class total
          </p>
          {showInsights && <InsightsBlock insights={showInsights} />}
          <button
            type="button"
            onClick={() => navigate('/education/student/home')}
            style={{ ...s.buttonSecondary, marginTop: 24 }}
          >
            Back to assignments
          </button>
        </>
      )}
    </EducationShell>
  )
}
