import { ArrowRight, CheckCircle2, HelpCircle, LogIn } from 'lucide-react';
import { CheckInBackground } from './CheckInBackground';
import './checkin.css';

const steps = [
  {
    title: 'Find your name',
    description: 'On the first page, enter at least 2 characters of your first or last name. Results appear as you type.',
    instructions: 'Select your registration, check that the name and organization are yours, then press Continue.'
  },
  {
    title: 'Create your account',
    description: 'On the second page, check your email address or enter the address you want to use to log in.',
    instructions: 'Create a password with at least 6 characters and enter it again in Confirm password. The eye icons let you check what you typed. Press Create account once and wait for confirmation.'
  },
  {
    title: 'Check-in complete',
    description: 'The success page confirms your registration and shows your name, email, organization, and check-in time.',
    instructions: 'Press Go to Login and sign in with the email and password you just entered.'
  }
];

const questions = [
  {
    title: 'My name does not appear in the search.',
    answer: 'Try your first name, last name, or a shorter part of your name with at least 2 characters. Check the spelling. If you still cannot find your registration, visit the registration desk. Check-in is available to attendees already on the registered list.'
  },
  {
    title: 'I selected the wrong person.',
    answer: 'On the account page, use Back to find your name. Search again and select your own registration before creating the account. If you have already completed check-in under the wrong name, ask the registration desk to correct it.'
  },
  {
    title: 'My password is not accepted.',
    answer: 'Use at least 6 characters and make sure both password fields match exactly, including capital letters and spaces. Use the eye icons to check your entries. A longer password with a mix of letters, numbers, and symbols improves the strength indicator.'
  },
  {
    title: 'My email is already registered to another attendee.',
    answer: 'Check that you selected your own registration and entered your email correctly. If the address is correct, contact the registration desk to resolve the duplicate before continuing.'
  },
  {
    title: 'I have already checked in or cannot log in.',
    answer: 'If check-in is already complete, go to the login page and use the email and password you set. If you forgot your password or need to correct your email, contact the registration desk or administrator for help.'
  },
  {
    title: 'The page is loading or a request failed.',
    answer: 'Check your internet connection and wait for the current request to finish. If an error appears, reconnect and try again. If you are unsure whether check-in completed, search for your registration again; completed registrations open the success page.'
  }
];

const votingSteps = [
  {
    title: 'Sign in with your identifier',
    description: 'Enter the identifier shown for you in the eligible voter register on the login page.',
    instructions: 'Select Open my ballot. You do not need to create an account or enter an email or password.'
  },
  {
    title: 'Read the candidate profiles and manifestos',
    description: 'Review the candidates shown for your assigned representative position.',
    instructions: 'If a profile is cut off, use the down chevron to read the full manifesto. Use the up chevron to collapse it. Opening a manifesto does not select a candidate.'
  },
  {
    title: 'Select one candidate',
    description: 'Choose one candidate for the position you are eligible to vote for.',
    instructions: 'The selected card shows a tick. Choosing another candidate replaces your previous choice.'
  },
  {
    title: 'Review and submit your final vote',
    description: 'Check your selected candidate before pressing Submit Final Vote.',
    instructions: 'Wait for the success message or Ballot submitted status. You can submit only once. After submission, your selections are locked and cannot be changed through the ballot.'
  }
];

const votingQuestions = [
  {
    title: 'My identifier is missing or I am not eligible.',
    answer: 'Only identifiers assigned to active members in the current election voter register can sign in. Contact election support or visit the registration desk if your identifier is missing or your ballot says you are not eligible.'
  },
  {
    title: 'My voter identifier is not accepted.',
    answer: 'Check the identifier recorded for you in the voter register. Ask election support to correct it if needed.'
  },
  {
    title: 'Do I need an account or password?',
    answer: 'No. Members sign in with their voter identifier only. Contact election support if you cannot access your ballot.'
  },
  {
    title: 'How many candidates should I select?',
    answer: 'Select one candidate for the representative position shown on your ballot. Your voter identifier determines which position you can vote for.'
  },
  {
    title: 'I cannot see another position.',
    answer: 'Each voter sees only the position assigned to their identifier in the voter register. Ask election support if your assignment is incorrect.'
  },
  {
    title: 'Voting is scheduled, closed, or no election appears.',
    answer: 'Voting is available only while the election is open. If it is scheduled, the ballot displays the opening time when one has been set. If voting has closed or no election has been prepared, contact the election team for the schedule. Candidate profiles can still be read when shown.'
  },
  {
    title: 'Can I change a vote after submitting?',
    answer: 'No. Review your selected candidate before pressing Submit Final Vote. A Ballot submitted status means no further ballot can be submitted.'
  },
  {
    title: 'My vote submission failed or the connection dropped.',
    answer: 'Restore your connection and reopen Voting to check whether the ballot was recorded. If Ballot submitted appears, your vote is already recorded. If it remains unsubmitted and voting is open, check your selections before trying again. Contact support if the status is unclear.'
  }
];

export default function CheckInSupport({ topic = 'checkin' }: { topic?: 'checkin' | 'voting' }) {
  const isVoting = topic === 'voting';
  const guideSteps = isVoting ? votingSteps : steps;
  const guideQuestions = isVoting ? votingQuestions : questions;
  return (
    <main className="professional-checkin">
      <CheckInBackground />
      <div className="checkin-panel checkin-support-panel">
        <span className="checkin-status-icon" aria-hidden="true"><HelpCircle size={30} strokeWidth={1.6} /></span>
        <header className="checkin-heading">
          <h1>{isVoting ? 'Voting support' : 'Check-in support'}</h1>
          <p>{isVoting ? 'From your voter registration to your final ballot.' : 'A guide from finding your name to signing in.'}</p>
        </header>

        {isVoting && <p className="checkin-voting-summary">Your ballot: <strong>one candidate for your assigned position</strong></p>}

        <section className="checkin-support-section" aria-labelledby="checkin-guide-heading">
          <h2 id="checkin-guide-heading">{isVoting ? 'How to register and vote' : 'How to check in'}</h2>
          <ol className="checkin-guide">
            {guideSteps.map((step, index) => (
              <li key={step.title}>
                <span className="checkin-guide-number" aria-hidden="true">{index + 1}</span>
                <div><h3>{step.title}</h3><p>{step.description}</p><p>{step.instructions}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="checkin-support-section" aria-labelledby="checkin-questions-heading">
          <h2 id="checkin-questions-heading">Common questions</h2>
          <div className="checkin-support-questions">
            {guideQuestions.map(question => (
              <details key={question.title}><summary>{question.title}</summary><p>{question.answer}</p></details>
            ))}
          </div>
        </section>

        <aside className="checkin-support-assistance">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <h2>Still need help?</h2>
            <p>{isVoting ? 'Message support on WhatsApp or visit the registration desk for help with voter eligibility, identifier, account access, or ballot submission.' : 'Message support on WhatsApp or visit the registration desk for help with your registration, details, or account access.'}</p>
          </div>
        </aside>

        <a href={isVoting ? '/' : '/checkin'} className="checkin-gold-button">{isVoting ? 'Go to voting' : 'Start check-in'} <ArrowRight size={17} aria-hidden="true" /></a>
        {!isVoting && <a href="/" className="checkin-back-link"><LogIn size={16} aria-hidden="true" /> Already checked in? Go to Login</a>}
      </div>
    </main>
  );
}
