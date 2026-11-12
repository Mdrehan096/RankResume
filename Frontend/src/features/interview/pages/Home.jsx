import React, { useState, useRef, useEffect } from 'react'
import '../style/home.scss'
import { useInterview } from '../hooks/useInterview.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useNavigate } from 'react-router'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const MODAL_CONTENT = {
    privacy: {
        title: 'Privacy Policy',
        body: 'Uploaded resumes and job descriptions are processed only to generate your personalized interview plan and tailored PDF resume. Your reports remain scoped to your authenticated account and are not shared with other users.',
    },
    terms: {
        title: 'Terms of Service',
        body: 'Interview strategies, match scores, and tailored resumes are AI-assisted recommendations intended for preparation. Review generated documents for accuracy before submitting job applications.',
    },
    help: {
        title: 'Help Center',
        body: 'Paste a full job description (up to 5,000 characters) and either upload a PDF or DOCX resume (max 5MB) or enter a short self-description. Click Generate My Interview Strategy to review questions, skill gaps, a day-by-day plan, and download a tailored PDF resume.',
    },
}

const isSupportedResumeFile = (file) => {
    if (!file) return false
    const lowerName = (file.name || '').toLowerCase()
    const hasAllowedExt = lowerName.endsWith('.pdf') || lowerName.endsWith('.docx')
    const hasAllowedMime = ALLOWED_MIME_TYPES.has(file.type)
    return hasAllowedExt || hasAllowedMime
}

const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const Home = () => {
    const { loading, generating, error: reportsError, generateReport, reports } = useInterview()
    const { user, handleLogout } = useAuth()

    const [jobDescription, setJobDescription] = useState('')
    const [selfDescription, setSelfDescription] = useState('')
    const [resumeFile, setResumeFile] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [formError, setFormError] = useState('')
    const [activeModal, setActiveModal] = useState(null)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const resumeInputRef = useRef(null)
    const topbarRef = useRef(null)
    const strategyCardRef = useRef(null)
    const reportsSectionRef = useRef(null)
    const navigate = useNavigate()

    useEffect(() => {
        if (!activeModal && !mobileMenuOpen) return
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                setActiveModal(null)
                setMobileMenuOpen(false)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [activeModal, mobileMenuOpen])

    useEffect(() => {
        if (!mobileMenuOpen) return
        const handleOutsideClick = (e) => {
            if (topbarRef.current && !topbarRef.current.contains(e.target)) {
                setMobileMenuOpen(false)
            }
        }
        const handleResize = () => {
            if (window.innerWidth > 480) {
                setMobileMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        window.addEventListener('resize', handleResize)
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick)
            window.removeEventListener('resize', handleResize)
        }
    }, [mobileMenuOpen])

    useEffect(() => {
        if (!activeModal) return
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prevOverflow
        }
    }, [activeModal])

    const validateAndSelectFile = (file) => {
        if (!file) return

        if (!isSupportedResumeFile(file)) {
            setFormError('Unsupported file type. Please upload a PDF or DOCX resume.')
            setResumeFile(null)
            if (resumeInputRef.current) {
                resumeInputRef.current.value = ''
            }
            return
        }

        if (file.size === 0) {
            setFormError('The selected file is empty. Please choose a valid resume file.')
            setResumeFile(null)
            if (resumeInputRef.current) {
                resumeInputRef.current.value = ''
            }
            return
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            setFormError('File exceeds the 5MB size limit. Please upload a smaller PDF or DOCX.')
            setResumeFile(null)
            if (resumeInputRef.current) {
                resumeInputRef.current.value = ''
            }
            return
        }

        setFormError('')
        setResumeFile(file)
    }

    const handleFileInputChange = (e) => {
        const file = e.target.files?.[0]
        validateAndSelectFile(file)
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer?.files?.[0]
        if (file) {
            validateAndSelectFile(file)
        }
    }

    const handleRemoveFile = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setResumeFile(null)
        if (resumeInputRef.current) {
            resumeInputRef.current.value = ''
        }
    }

    const handleGenerateReport = async () => {
        const trimmedJob = jobDescription.trim()
        const trimmedSelf = selfDescription.trim()

        if (!trimmedJob) {
            setFormError('Target job description is required.')
            return
        }

        if (!resumeFile && !trimmedSelf) {
            setFormError('Please upload a resume (PDF or DOCX) or enter a quick self-description.')
            return
        }

        setFormError('')
        const { data, error } = await generateReport({
            jobDescription: trimmedJob,
            selfDescription: trimmedSelf,
            resumeFile,
        })

        if (data?._id) {
            navigate(`/interview/${data._id}`)
        } else {
            setFormError(error || 'Failed to generate interview strategy. Please try again.')
        }
    }

    const onLogout = async () => {
        setMobileMenuOpen(false)
        await handleLogout()
        navigate('/login', { replace: true })
    }

    const scrollToSection = (sectionRef) => {
        setMobileMenuOpen(false)
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const openModalFromMenu = (modalKey) => {
        setMobileMenuOpen(false)
        setActiveModal(modalKey)
    }

    const modalInfo = activeModal ? MODAL_CONTENT[activeModal] : null

    return (
        <div className='home-page'>
            {/* Top Bar */}
            <nav ref={topbarRef} className='home-topbar' aria-label='Account navigation'>
                <div className='home-topbar__row'>
                    <div className='home-topbar__brand'>
                        <span className='brand-dot' />
                        <span>RankResume</span>
                    </div>
                    <div className='home-topbar__actions'>
                        {user?.username && (
                            <span className='home-topbar__user'>Signed in as {user.username}</span>
                        )}
                        <button
                            type='button'
                            onClick={onLogout}
                            className='logout-btn'
                        >
                            Logout
                        </button>
                    </div>
                    <button
                        type='button'
                        className='home-menu-btn'
                        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                        aria-expanded={mobileMenuOpen}
                        aria-controls='home-mobile-menu'
                        onClick={() => setMobileMenuOpen((open) => !open)}
                    >
                        {mobileMenuOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        )}
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div id='home-mobile-menu' className='home-mobile-menu'>
                        {user?.username && (
                            <div className='home-mobile-menu__user'>
                                Signed in as <strong>{user.username}</strong>
                            </div>
                        )}
                        <button
                            type='button'
                            className='home-mobile-menu__item'
                            onClick={() => scrollToSection(strategyCardRef)}
                        >
                            Create Interview Plan
                        </button>
                        {reports.length > 0 && (
                            <button
                                type='button'
                                className='home-mobile-menu__item'
                                onClick={() => scrollToSection(reportsSectionRef)}
                            >
                                Recent Plans ({reports.length})
                            </button>
                        )}
                        <button
                            type='button'
                            className='home-mobile-menu__item'
                            onClick={() => openModalFromMenu('help')}
                        >
                            Help Center
                        </button>
                        <button
                            type='button'
                            className='home-mobile-menu__logout'
                            onClick={onLogout}
                        >
                            Logout
                        </button>
                    </div>
                )}
            </nav>

            {/* Page Header */}
            <header className='page-header'>
                <h1>Create Your Custom <span className='highlight'>Interview Plan</span></h1>
                <p>Let our AI analyze the job requirements and your unique profile to build a winning strategy.</p>
            </header>

            {/* Main Card */}
            <div ref={strategyCardRef} className='interview-card'>
                <div className='interview-card__body'>

                    {/* Left Panel - Job Description */}
                    <div className='panel panel--left'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                            </span>
                            <h2>Target Job Description</h2>
                            <span className='badge badge--required'>Required</span>
                        </div>
                        <div className='textarea-wrap'>
                            <textarea
                                value={jobDescription}
                                onChange={(e) => {
                                    setJobDescription(e.target.value)
                                    if (formError) setFormError('')
                                }}
                                aria-label='Target Job Description'
                                className='panel__textarea'
                                placeholder={`Paste the full job description here...\ne.g. 'Senior Frontend Engineer at Google requires proficiency in React, TypeScript, and large-scale system design...'`}
                                maxLength={5000}
                            />
                            <div className='char-counter'>{jobDescription.length} / 5000 chars</div>
                        </div>
                    </div>

                    {/* Vertical Divider */}
                    <div className='panel-divider' />

                    {/* Right Panel - Profile */}
                    <div className='panel panel--right'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            </span>
                            <h2>Your Profile</h2>
                        </div>

                        {/* Upload Resume */}
                        <div className='upload-section'>
                            <label className='section-label' htmlFor='resume'>
                                Upload Resume
                                <span className='badge badge--best'>Best Results</span>
                            </label>
                            <label
                                className={`dropzone ${isDragging ? 'dropzone--active' : ''} ${resumeFile ? 'dropzone--has-file' : ''}`}
                                htmlFor='resume'
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <span className='dropzone__icon'>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
                                </span>
                                {resumeFile ? (
                                    <div className='selected-file'>
                                        <p className='dropzone__title'>{resumeFile.name}</p>
                                        <p className='dropzone__subtitle'>{formatFileSize(resumeFile.size)}</p>
                                        <button
                                            type='button'
                                            className='remove-file-btn'
                                            onClick={handleRemoveFile}
                                        >
                                            Remove file
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <p className='dropzone__title'>Click to upload or drag &amp; drop</p>
                                        <p className='dropzone__subtitle'>PDF or DOCX (Max 5MB)</p>
                                    </>
                                )}
                                <input
                                    ref={resumeInputRef}
                                    hidden
                                    type='file'
                                    id='resume'
                                    name='resume'
                                    accept='.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                    onChange={handleFileInputChange}
                                />
                            </label>
                        </div>

                        {/* OR Divider */}
                        <div className='or-divider'><span>OR</span></div>

                        {/* Quick Self-Description */}
                        <div className='self-description'>
                            <label className='section-label' htmlFor='selfDescription'>Quick Self-Description</label>
                            <textarea
                                value={selfDescription}
                                onChange={(e) => {
                                    setSelfDescription(e.target.value)
                                    if (formError) setFormError('')
                                }}
                                id='selfDescription'
                                name='selfDescription'
                                className='panel__textarea panel__textarea--short'
                                placeholder="Briefly describe your experience, key skills, and years of experience if you don't have a resume handy..."
                                maxLength={5000}
                            />
                        </div>

                        {/* Info Box */}
                        <div className='info-box'>
                            <span className='info-box__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" stroke="#1a1f27" strokeWidth="2" /><line x1="12" y1="16" x2="12.01" y2="16" stroke="#1a1f27" strokeWidth="2" /></svg>
                            </span>
                            <p>Either a <strong>Resume</strong> or a <strong>Self Description</strong> is required to generate a personalized plan.</p>
                        </div>
                    </div>
                </div>

                {formError && (
                    <div className='home-form-error' role='alert'>
                        {formError}
                    </div>
                )}

                {/* Card Footer */}
                <div className='interview-card__footer'>
                    <span className='footer-info'>AI-Powered Strategy Generation &bull; Approx 30s</span>
                    <button
                        type='button'
                        onClick={handleGenerateReport}
                        disabled={generating}
                        className='generate-btn'
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                        {generating ? 'Generating Strategy...' : 'Generate My Interview Strategy'}
                    </button>
                </div>
            </div>

            {/* Recent Reports List */}
            {(loading || reportsError || reports.length > 0) && (
                <section ref={reportsSectionRef} className='recent-reports'>
                    <h2>My Recent Interview Plans</h2>
                    {loading && reports.length === 0 && (
                        <p className='recent-reports__status'>Loading your recent interview plans...</p>
                    )}
                    {!loading && reportsError && reports.length === 0 && (
                        <p className='recent-reports__status recent-reports__status--error'>{reportsError}</p>
                    )}
                    {reports.length > 0 && (
                        <ul className='reports-list'>
                            {reports.map((report) => {
                                const scoreValue = Number(report.matchScore ?? 0)
                                const scoreClass =
                                    scoreValue >= 80 ? 'score--high' : scoreValue >= 60 ? 'score--mid' : 'score--low'
                                const formattedDate = report.createdAt
                                    ? new Date(report.createdAt).toLocaleDateString()
                                    : ''

                                return (
                                    <li
                                        key={report._id}
                                        className='report-item'
                                        role='button'
                                        tabIndex={0}
                                        onClick={() => navigate(`/interview/${report._id}`)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                navigate(`/interview/${report._id}`)
                                            }
                                        }}
                                    >
                                        <h3>{report.title || 'Untitled Position'}</h3>
                                        {formattedDate && (
                                            <p className='report-meta'>Generated on {formattedDate}</p>
                                        )}
                                        <p className={`match-score ${scoreClass}`}>
                                            Match Score: {scoreValue}%
                                        </p>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </section>
            )}

            {/* Page Footer */}
            <footer className='page-footer'>
                <button type='button' className='footer-link-btn' onClick={() => setActiveModal('privacy')}>
                    Privacy Policy
                </button>
                <button type='button' className='footer-link-btn' onClick={() => setActiveModal('terms')}>
                    Terms of Service
                </button>
                <button type='button' className='footer-link-btn' onClick={() => setActiveModal('help')}>
                    Help Center
                </button>
            </footer>

            {modalInfo && (
                <div
                    className='info-modal-backdrop'
                    role='dialog'
                    aria-modal='true'
                    aria-labelledby='info-modal-title'
                    onClick={() => setActiveModal(null)}
                >
                    <div className='info-modal' onClick={(e) => e.stopPropagation()}>
                        <h2 id='info-modal-title'>{modalInfo.title}</h2>
                        <p>{modalInfo.body}</p>
                        <button
                            type='button'
                            className='info-modal__close'
                            onClick={() => setActiveModal(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Home
