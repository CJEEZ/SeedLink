import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from '@ionic/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { municipalities } from '../data/municipalities';
import './Login.css';

function getLoginErrorMessage(error: unknown, email: string): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === 'admin@seedlink.test' || normalizedEmail === 'farmer@seedlink.test') {
        return 'That is a local demo account, not a live Firebase account. To use the connected app, create the user in Firebase Console → Authentication, then provision its SeedLink profile in Realtime Database.';
      }
      return 'Firebase could not verify this email and password. Check the password or use Forgot password. If this account is not listed in the connected Firebase project, an administrator must create it and provision its SeedLink profile.';
    }
    if (error.code === 'auth/too-many-requests') {
      return 'Too many sign-in attempts. Wait a few minutes, then try again or reset your password.';
    }
    if (error.code === 'auth/operation-not-allowed') {
      return 'Email/password sign-in is disabled for this Firebase project. Ask an administrator to enable it in Firebase Authentication.';
    }
  }

  return error instanceof Error ? error.message : 'Sign-in failed. Check your account and try again.';
}

function getGoogleLoginErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    if (error.code === 'auth/unauthorized-domain') {
      return 'This site is not authorized for Google sign-in. Ask your Firebase administrator to add this domain under Authentication → Settings → Authorized domains.';
    }
    if (error.code === 'auth/operation-not-allowed') {
      return 'Google sign-in is not enabled for this Firebase project. Ask your Firebase administrator to enable Google under Authentication → Sign-in method.';
    }
    if (error.code === 'auth/account-exists-with-different-credential') {
      return 'This email already uses another sign-in method. Sign in with that method first, then ask an administrator to link Google to your Firebase account.';
    }
    if (error.code === 'auth/popup-closed-by-user') {
      return 'Google sign-in was cancelled.';
    }
  }

  return error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
}

const Login: React.FC = () => {
  const {
    user,
    profile,
    profileError,
    needsGoogleFarmerSetup,
    signIn,
    signInWithGoogle,
    completeGoogleFarmerSetup,
    sendPasswordReset,
    signOutUser,
  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginVideo, setShowLoginVideo] = useState(true);
  const showGoogleFarmerSetup = Boolean(
    user
      && !profile
      && needsGoogleFarmerSetup
      && user.providerData.some((provider) => provider.providerId === 'google.com'),
  );

  useEffect(() => {
    if (user && profile) navigate('/home', { replace: true });
  }, [navigate, profile, user]);

  useEffect(() => {
    if (!user || !showGoogleFarmerSetup) {
      setMunicipality('');
      setError('');
    }
  }, [showGoogleFarmerSetup, user]);

  const handleSignOut = async () => {
    setError('');
    try {
      await signOutUser();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out. Please try again.');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setResetMessage('');
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (signInError) {
      setError(getLoginErrorMessage(signInError, email));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setResetMessage('');
    if (!email.trim()) {
      setError('Enter your Firebase account email above, then choose Forgot password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email);
      setResetMessage('If a Firebase account exists for this email, a password reset link has been sent.');
    } catch (resetError) {
      setError(getLoginErrorMessage(resetError, email));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setResetMessage('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (googleError) {
      setError(getGoogleLoginErrorMessage(googleError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleFarmerSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!municipality) {
      setError('Select your municipality to continue.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await completeGoogleFarmerSetup(municipality);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Could not complete account setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="login-content" fullscreen>
        <main className="login-layout">
          <div className="login-background" aria-hidden="true">
            {showLoginVideo ? (
              <video
                className="login-background-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster={`${import.meta.env.BASE_URL}SEEDSORMIN.jpg`}
                onError={() => setShowLoginVideo(false)}
              >
                <source src={`${import.meta.env.BASE_URL}seedlink-auth-background.mp4`} type="video/mp4" />
              </video>
            ) : (
              <img className="login-background-fallback" src={`${import.meta.env.BASE_URL}SEEDSORMIN.jpg`} alt="" />
            )}
          </div>
          <section className="login-main login-main-auth">
            <div className="auth-welcome">
              <p className="auth-welcome-kicker">KASAMA SA PAG-UNLAD</p>
              <h1>Maligayang pagbabalik!</h1>
              <p>Mag-sign in para makita ang iyong seed inventory, requests, at delivery updates. Sama-sama nating suportahan ang masaganang ani.</p>
            </div>
            <div className="login-form-wrap login-form-wrap-3d">
              <Link className="login-brand login-card-brand" to="/" aria-label="SeedLink landing page">
                <span className="login-brand-mark"><img src={`${import.meta.env.BASE_URL}Agricultural%20Logo%20for%20SeedLink%20(1).png`} alt="" /></span>
              </Link>
              <p className="login-eyebrow">SECURE WORKSPACE</p>
              <h2>Sign in to SeedLink</h2>
              <p className="login-intro">
                {showGoogleFarmerSetup
                  ? 'Your Google account is signed in. Choose your municipality to finish setting up a farmer profile.'
                  : 'Use the account assigned to you by your SeedLink administrator.'}
              </p>
              {showGoogleFarmerSetup ? (
                <form className="login-form" onSubmit={(event) => void handleGoogleFarmerSetup(event)}>
                  <IonItem className="login-field login-municipality-select" lines="none">
                    <IonSelect
                      label="Municipality"
                      labelPlacement="stacked"
                      placeholder="Select your municipality"
                      value={municipality}
                      onIonChange={(event) => setMunicipality(event.detail.value ?? '')}
                      interface="popover"
                      required
                    >
                      {municipalities.map((place) => <IonSelectOption key={place} value={place}>{place}</IonSelectOption>)}
                    </IonSelect>
                  </IonItem>
                  {error && <p className="login-error" role="alert">{error}</p>}
                  <IonButton className="login-submit" expand="block" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <IonSpinner name="dots" /> : 'Continue to SeedLink'}
                  </IonButton>
                  <IonButton fill="clear" color="medium" type="button" disabled={isSubmitting} onClick={() => void handleSignOut()}>
                    Sign out
                  </IonButton>
                </form>
              ) : (
                <>
              <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
                <IonItem className="login-field" lines="none">
                  <IonInput
                    label="Email address"
                    labelPlacement="stacked"
                    type="email"
                    autocomplete="username"
                    value={email}
                    onIonInput={(event) => setEmail(event.detail.value ?? '')}
                    required
                  />
                </IonItem>
                <IonItem className="login-field" lines="none">
                  <IonInput
                    label="Password"
                    labelPlacement="stacked"
                    type="password"
                    autocomplete="current-password"
                    value={password}
                    onIonInput={(event) => setPassword(event.detail.value ?? '')}
                    required
                  />
                </IonItem>
                {(error || profileError) && <p className="login-error" role="alert">{error || profileError}</p>}
                {user && profileError && <IonButton fill="clear" color="medium" onClick={() => void handleSignOut()}>Sign out</IonButton>}
                <IonButton className="login-submit" expand="block" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <IonSpinner name="dots" /> : 'Sign in'}
                </IonButton>
              </form>
              <div className="login-divider" aria-hidden="true"><span>or continue with</span></div>
              <IonButton
                className="login-google"
                expand="block"
                fill="outline"
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleGoogleSignIn()}
              >
                <span className="login-google-mark" aria-hidden="true">G</span>
                Continue with Google
              </IonButton>
              <IonButton className="login-reset-button" fill="clear" type="button" disabled={isSubmitting} onClick={() => void handlePasswordReset()}>
                Forgot password?
              </IonButton>
              {resetMessage && <p className="login-reset-message" role="status">{resetMessage}</p>}
              <p className="login-help">Farmer or cooperative leader? <Link to="/signup">Create an account</Link></p>
              <p className="login-help">Staff access is provisioned by your Municipal Agriculture Office.</p>
                </>
              )}
            </div>
          </section>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Login;