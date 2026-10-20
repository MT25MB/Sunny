import { useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  LockKeyhole,
  Monitor,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

type Step = 0 | 1 | 2 | 3;

type Props = {
  onComplete: () => void;
  onSkip: () => void;
};

type PermissionStep = {
  id: string;
  icon: typeof Camera;
  title: string;
  description: string;
  platform: 'all' | 'macos' | 'windows';
  instructions: string[];
};

const PERMISSION_STEPS: PermissionStep[] = [
  {
    id: 'screen-recording',
    icon: Camera,
    title: 'Screen Recording Permission',
    description: 'Sunny needs to see your screen to understand what is happening and help you.',
    platform: 'macos',
    instructions: [
      'Open System Settings > Privacy & Security > Screen Recording',
      'Find Sunny in the list and toggle it on',
      'Restart Sunny when prompted',
    ],
  },
  {
    id: 'accessibility',
    icon: MousePointer2,
    title: 'Accessibility Permission',
    description: 'Sunny needs accessibility access to click, type, and interact with apps on your behalf.',
    platform: 'macos',
    instructions: [
      'Open System Settings > Privacy & Security > Accessibility',
      'Find Sunny in the list and toggle it on',
      'You may need to restart Sunny for changes to take effect',
    ],
  },
  {
    id: 'windows-privacy',
    icon: Monitor,
    title: 'Windows Permissions',
    description: 'Sunny works on Windows without special permissions. Your antivirus may ask for confirmation on first launch -- allow it so Sunny can interact with your screen.',
    platform: 'windows',
    instructions: [
      'If Windows SmartScreen appears, click "More info" then "Run anyway"',
      'Allow Sunny through any antivirus prompts',
      'No additional system permissions are needed on Windows',
    ],
  },
];

function getPlatform(): 'macos' | 'windows' | 'linux' {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('win')) return 'windows';
  }
  return 'linux';
}

export function OnboardingScreen({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [checkedPermissions, setCheckedPermissions] = useState<Set<string>>(new Set());
  const platform = getPlatform();

  const relevantSteps = PERMISSION_STEPS.filter(
    (s) => s.platform === 'all' || s.platform === platform
  );

  const togglePermission = (id: string) => {
    setCheckedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isWelcomeStep = step === 0;
  const isPermissionStep = step > 0 && step <= relevantSteps.length;
  const isFinalStep = step === relevantSteps.length + 1;

  const currentPermission = isPermissionStep ? relevantSteps[step - 1] : null;

  const handleNext = () => {
    if (isWelcomeStep) {
      setStep(1);
    } else if (isPermissionStep) {
      if (currentPermission) togglePermission(currentPermission.id);
      if (step < relevantSteps.length) {
        setStep((s) => (s + 1) as Step);
      } else {
        setStep((relevantSteps.length + 1) as Step);
      }
    } else if (isFinalStep) {
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => (s - 1) as Step);
  };

  const totalSteps = relevantSteps.length + 2;
  const progressPct = ((step + 1) / totalSteps) * 100;

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">
        <button className="onboarding-skip" onClick={onSkip} aria-label="Skip onboarding">
          <X size={16} /> Skip
        </button>

        <div className="onboarding-progress">
          <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {isWelcomeStep && (
          <div className="onboarding-welcome">
            <div className="onboarding-mascot-frame">
              <div className="onboarding-mascot-glow" />
              <Sparkles size={40} className="onboarding-mascot-icon" />
            </div>
            <h1>Welcome to Sunny</h1>
            <p>
              Your friendly desktop companion that can see your screen and help you get things done.
              Let's set up a few things so Sunny can work its magic.
            </p>
            <div className="onboarding-features">
              <div className="onboarding-feature">
                <Camera size={20} />
                <span>Sees your screen</span>
              </div>
              <div className="onboarding-feature">
                <MousePointer2 size={20} />
                <span>Clicks and types for you</span>
              </div>
              <div className="onboarding-feature">
                <ShieldCheck size={20} />
                <span>Always asks before risky actions</span>
              </div>
            </div>
          </div>
        )}

        {currentPermission && (
          <div className="onboarding-permission">
            <div className={`onboarding-perm-icon ${checkedPermissions.has(currentPermission.id) ? 'checked' : ''}`}>
              {checkedPermissions.has(currentPermission.id) ? <Check size={28} /> : <currentPermission.icon size={28} />}
            </div>
            <h2>{currentPermission.title}</h2>
            <p>{currentPermission.description}</p>
            <div className="onboarding-instructions">
              <span className="onboarding-instructions-label">How to turn on:</span>
              <ol>
                {currentPermission.instructions.map((instruction, i) => (
                  <li key={i}>{instruction}</li>
                ))}
              </ol>
            </div>
            <button
              className={`onboarding-check-btn ${checkedPermissions.has(currentPermission.id) ? 'checked' : ''}`}
              onClick={() => togglePermission(currentPermission.id)}
            >
              {checkedPermissions.has(currentPermission.id) ? (
                <><Check size={16} /> Done, I've turned it on</>
              ) : (
                <><LockKeyhole size={16} /> I'll turn this on now</>
              )}
            </button>
          </div>
        )}

        {isFinalStep && (
          <div className="onboarding-final">
            <div className="onboarding-final-icon">
              <Check size={44} />
            </div>
            <h1>You're all set!</h1>
            <p>
              Sunny is ready to help. Just type what you want to do, and Sunny will take care of the rest.
              You can adjust settings anytime by clicking the gear icon.
            </p>
            <div className="onboarding-tip">
              <Sparkles size={16} />
              <span>Tip: Press Cmd+Shift+Space (or Ctrl+Shift+Space) to show or hide Sunny instantly.</span>
            </div>
          </div>
        )}

        <div className="onboarding-nav">
          {step > 0 && (
            <button className="onboarding-back-btn" onClick={handleBack}>
              Back
            </button>
          )}
          <button className="onboarding-next-btn" onClick={handleNext}>
            {isFinalStep ? 'Start using Sunny' : isWelcomeStep ? 'Get started' : 'Continue'}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
