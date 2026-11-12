import React, { useState, useEffect } from 'react'
import '../style/interview.scss'
import { useInterview } from '../hooks/useInterview.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useNavigate, useParams } from 'react-router'

const NAV_ITEMS = [
    {
        id: 'technical',
        label: 'Technical Questions',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
            </svg>
        ),
    },
    {
        id: 'behavioral',
        label: 'Behavioral Questions',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        id: 'roadmap',
        label: 'Road Map',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
        ),
    },
]

// ── Sub-components ────────────────────────────────────────────────────────────
const QuestionCard = ({ item, index }) => {
    const [open, setOpen] = useState(false)
    return (
        <div className='q-card'>
            <button
                type='button'
                className='q-card__header'
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                <span className='q-card__index'>Q{index + 1}</span>
                <span className='q-card__question'>{item.question}</span>
                <span className={`q-card__chevron ${open ? 'q-card__chevron--open' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </span>
            </button>
            {open && (
                <div className='q-card__body'>
                    <div className='q-card__section'>
                        <span className='q-card__tag q-card__tag--intention'>Intention</span>
                        <p>{item.intention}</p>
                    </div>
                    <div className='q-card__section'>
                        <span className='q-card__tag q-card__tag--answer'>Model Answer</span>
                        <p>{item.answer}</p>
                    </div>
                </div>
            )}
        </div>
    )
}

const RoadMapDay = ({ day }) => (
    <div className='roadmap-day'>
        <div className='roadmap-day__header'>
            <span className='roadmap-day__badge'>Day {day.day}</span>
            <h3 className='roadmap-day__focus'>{day.focus}</h3>
        </div>
        <ul className='roadmap-day__tasks'>
            {(day.tasks || []).map((task, i) => (
                <li key={i}>
                    <span className='roadmap-day__bullet' />
                    {task}
                </li>
            ))}
        </ul>
    </div>
)

// ── Main Component ────────────────────────────────────────────────────────────
const Interview = () => {
    const [activeNav, setActiveNav] = useState('technical')
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [tabletNavOpen, setTabletNavOpen] = useState(false)
    const [pdfError, setPdfError] = useState('')
    const { report, loading, pdfLoading, error, getResumePdf } = useInterview()
    const { handleLogout } = useAuth()
    const { interviewId } = useParams()
    const navigate = useNavigate()

    useEffect(() => {
        if (!mobileNavOpen && !tabletNavOpen) return
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                setMobileNavOpen(false)
                setTabletNavOpen(false)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [mobileNavOpen, tabletNavOpen])

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 480) {
                setMobileNavOpen(false)
            }
            if (window.innerWidth > 900) {
                setTabletNavOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        if (!mobileNavOpen) return
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prevOverflow
        }
    }, [mobileNavOpen])

    const hasMatchingReport = Boolean(report && report._id === interviewId)

    if (loading || (!hasMatchingReport && !error)) {
        return (
            <main className='loading-screen'>
                <h1>Loading your interview plan...</h1>
            </main>
        )
    }

    if (!hasMatchingReport) {
        return (
            <main className='loading-screen'>
                <div className='error-state-card' role='alert'>
                    <h1>Unable to Load Interview Plan</h1>
                    <p>{error || 'This interview report could not be found.'}</p>
                    <button
                        type='button'
                        className='button primary-button'
                        onClick={() => navigate('/')}
                    >
                        Back to Dashboard
                    </button>
                </div>
            </main>
        )
    }

    const technicalQuestions = report.technicalQuestions || []
    const behavioralQuestions = report.behavioralQuestions || []
    const preparationPlan = report.preparationPlan || []
    const skillGaps = report.skillGaps || []
    const matchScore = Number(report.matchScore ?? 0)
    const activeNavLabel = NAV_ITEMS.find((item) => item.id === activeNav)?.label || 'Sections'

    const scoreColor =
        matchScore >= 80 ? 'score--high' : matchScore >= 60 ? 'score--mid' : 'score--low'

    const scoreSubtitle =
        matchScore >= 80
            ? 'Strong match for this role'
            : matchScore >= 60
                ? 'Moderate match for this role'
                : 'Needs targeted preparation'

    const handleSelectNav = (sectionId) => {
        setActiveNav(sectionId)
        setMobileNavOpen(false)
        setTabletNavOpen(false)
    }

    const handleNavigateDashboard = () => {
        setMobileNavOpen(false)
        setTabletNavOpen(false)
        navigate('/')
    }

    const handleDownloadResume = async () => {
        setPdfError('')
        const result = await getResumePdf(interviewId)
        if (!result?.success) {
            setPdfError(result?.error || 'Failed to generate resume PDF.')
        }
    }

    const onLogout = async () => {
        setMobileNavOpen(false)
        setTabletNavOpen(false)
        await handleLogout()
        navigate('/login', { replace: true })
    }

    return (
        <div className='interview-page'>
            <header className='interview-topbar'>
                <button
                    type='button'
                    className='menu-toggle-btn'
                    aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={mobileNavOpen}
                    aria-controls='interview-navigation'
                    onClick={() => setMobileNavOpen((open) => !open)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
                <button
                    type='button'
                    className='topbar-btn topbar-btn--dashboard'
                    onClick={handleNavigateDashboard}
                >
                    &larr; Dashboard
                </button>
                <h1 className='interview-topbar__title'>{report.title || 'Interview Strategy'}</h1>
                <button
                    type='button'
                    className='mobile-back-btn'
                    aria-label='Back to Dashboard'
                    onClick={handleNavigateDashboard}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                </button>
                <button
                    type='button'
                    className='topbar-btn topbar-btn--logout'
                    onClick={onLogout}
                >
                    Logout
                </button>
            </header>

            {mobileNavOpen && (
                <div
                    className='interview-nav-backdrop'
                    aria-hidden='true'
                    onClick={() => setMobileNavOpen(false)}
                />
            )}

            <div className='interview-layout'>
                {/* Tablet Collapsible Toggle Bar */}
                <div className='interview-tablet-toggle'>
                    <button
                        type='button'
                        className='interview-tablet-toggle__btn'
                        aria-expanded={tabletNavOpen}
                        aria-controls='interview-navigation'
                        onClick={() => setTabletNavOpen((open) => !open)}
                    >
                        <span className='interview-tablet-toggle__label'>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                            Sections: <strong>{activeNavLabel}</strong>
                        </span>
                        <svg
                            className={`interview-tablet-toggle__chevron ${tabletNavOpen ? 'interview-tablet-toggle__chevron--open' : ''}`}
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>

                {/* ── Left Nav / Mobile Slide-In Drawer ── */}
                <nav
                    id='interview-navigation'
                    className={`interview-nav ${mobileNavOpen ? 'interview-nav--mobile-open' : ''} ${tabletNavOpen ? 'interview-nav--tablet-open' : ''}`}
                    aria-label='Interview sections'
                >
                    <div className='interview-nav__mobile-header'>
                        <span className='interview-nav__mobile-brand'>
                            <span className='brand-dot' />
                            RankResume
                        </span>
                        <button
                            type='button'
                            className='interview-nav__close-btn'
                            aria-label='Close navigation menu'
                            onClick={() => setMobileNavOpen(false)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    <div className='nav-content'>
                        <p className='interview-nav__label'>Sections</p>
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                type='button'
                                className={`interview-nav__item ${activeNav === item.id ? 'interview-nav__item--active' : ''}`}
                                onClick={() => handleSelectNav(item.id)}
                            >
                                <span className='interview-nav__icon'>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className='nav-actions'>
                        {pdfError && (
                            <p className='pdf-error' role='alert'>
                                {pdfError}
                            </p>
                        )}
                        <button
                            type='button'
                            onClick={handleDownloadResume}
                            disabled={pdfLoading}
                            className='button primary-button download-resume-btn'
                        >
                            <svg height={'0.8rem'} style={{ marginRight: '0.6rem', flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M10.6144 17.7956 11.492 15.7854C12.2731 13.9966 13.6789 12.5726 15.4325 11.7942L17.8482 10.7219C18.6162 10.381 18.6162 9.26368 17.8482 8.92277L15.5079 7.88394C13.7092 7.08552 12.2782 5.60881 11.5105 3.75894L10.6215 1.61673C10.2916.821765 9.19319.821767 8.8633 1.61673L7.97427 3.75892C7.20657 5.60881 5.77553 7.08552 3.97685 7.88394L1.63658 8.92277C.868537 9.26368.868536 10.381 1.63658 10.7219L4.0523 11.7942C5.80589 12.5726 7.21171 13.9966 7.99275 15.7854L8.8704 17.7956C9.20776 18.5682 10.277 18.5682 10.6144 17.7956ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899Z" />
                            </svg>
                            {pdfLoading ? 'Generating PDF...' : 'Download Resume'}
                        </button>

                        <div className='interview-nav__mobile-actions'>
                            <button
                                type='button'
                                className='interview-nav__mobile-btn'
                                onClick={handleNavigateDashboard}
                            >
                                &larr; Back to Dashboard
                            </button>
                            <button
                                type='button'
                                className='interview-nav__mobile-btn interview-nav__mobile-btn--logout'
                                onClick={onLogout}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </nav>

                <div className='interview-divider interview-divider--left' />

                {/* ── Center Content ── */}
                <main className='interview-content'>
                    {activeNav === 'technical' && (
                        <section>
                            <div className='content-header'>
                                <h2>Technical Questions</h2>
                                <span className='content-header__count'>{technicalQuestions.length} questions</span>
                            </div>
                            <div className='q-list'>
                                {technicalQuestions.map((q, i) => (
                                    <QuestionCard key={i} item={q} index={i} />
                                ))}
                            </div>
                        </section>
                    )}

                    {activeNav === 'behavioral' && (
                        <section>
                            <div className='content-header'>
                                <h2>Behavioral Questions</h2>
                                <span className='content-header__count'>{behavioralQuestions.length} questions</span>
                            </div>
                            <div className='q-list'>
                                {behavioralQuestions.map((q, i) => (
                                    <QuestionCard key={i} item={q} index={i} />
                                ))}
                            </div>
                        </section>
                    )}

                    {activeNav === 'roadmap' && (
                        <section>
                            <div className='content-header'>
                                <h2>Preparation Road Map</h2>
                                <span className='content-header__count'>{preparationPlan.length}-day plan</span>
                            </div>
                            <div className='roadmap-list'>
                                {preparationPlan.map((day, idx) => (
                                    <RoadMapDay key={day.day ?? idx} day={day} />
                                ))}
                            </div>
                        </section>
                    )}
                </main>

                <div className='interview-divider interview-divider--right' />

                {/* ── Right Sidebar ── */}
                <aside className='interview-sidebar'>
                    {/* Match Score */}
                    <div className='match-score'>
                        <p className='match-score__label'>Match Score</p>
                        <div className={`match-score__ring ${scoreColor}`}>
                            <span className='match-score__value'>{matchScore}</span>
                            <span className='match-score__pct'>%</span>
                        </div>
                        <p className={`match-score__sub ${scoreColor}`}>{scoreSubtitle}</p>
                    </div>

                    <div className='sidebar-divider' />

                    {/* Skill Gaps */}
                    <div className='skill-gaps'>
                        <p className='skill-gaps__label'>Skill Gaps</p>
                        <div className='skill-gaps__list'>
                            {skillGaps.map((gap, i) => (
                                <span key={i} className={`skill-tag skill-tag--${gap.severity || 'medium'}`}>
                                    {gap.skill}
                                </span>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}

export default Interview
