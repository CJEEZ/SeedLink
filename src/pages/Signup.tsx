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
import './Signup.css';

const Signup: React.FC = () => {
  const { user, profile, profileError, signUpFarmer, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSignupVideo, setShowSignupVideo] = useState(true);

  useEffect(() => {
    if (user && profile) navigate('/home', { replace: true });
  }, [navigate, profile, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2 || !municipality) {
      setError('Enter your name and select your municipality.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await signUpFarmer(name, email.trim(), password, municipality);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="login-content signup-content" fullscreen>
        <main className="login-layout signup-layout">
          <div className="login-background" aria-hidden="true">
            {showSignupVideo ? (
              <video
                className="login-background-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/SEEDSORMIN.jpg"
                onError={() => setShowSignupVideo(false)}
              >
                <source src="/seedlink-auth-background.mp4" type="video/mp4" />
              </video>
            ) : (
              <img className="login-background-fallback" src="/SEEDSORMIN.jpg" alt="" />
            )}
          </div>
          <section className="login-main login-main-auth signup-main signup-main-auth">
            <div className="auth-welcome">
              <p className="auth-welcome-kicker">TARA, MAGTANIM TAYO</p>
              <h1>Simulan ang masaganang ani.</h1>
              <p>Gumawa ng SeedLink account para mas madaling makapag-request ng binhi at masubaybayan ang iyong mga delivery.</p>
            </div>
            <div className="login-form-wrap login-form-wrap-3d">
              <Link className="login-brand login-card-brand" to="/" aria-label="SeedLink landing page">
                <span className="login-brand-mark"><img src="/Agricultural%20Logo%20for%20SeedLink%20(1).png" alt="" /></span>
              </Link>
              <p className="login-eyebrow">FARMER & COOPERATIVE ACCESS</p>
              <h2>Create your account</h2>
              <p className="login-intro">Register to request seed allocations and confirm deliveries.</p>
              <form className="login-form signup-form" onSubmit={(event) => void handleSubmit(event)}>
                <IonItem className="login-field" lines="none">
                  <IonInput label="Full name" labelPlacement="stacked" autocomplete="name" value={displayName} maxlength={100} onIonInput={(event) => setDisplayName(event.detail.value ?? '')} required />
                </IonItem>
                <IonItem className="login-field" lines="none">
                  <IonInput label="Email address" labelPlacement="stacked" type="email" autocomplete="email" value={email} onIonInput={(event) => setEmail(event.detail.value ?? '')} required />
                </IonItem>
                <IonItem className="login-field signup-select" lines="none">
                  <IonSelect label="Municipality" labelPlacement="stacked" placeholder="Select your municipality" value={municipality} onIonChange={(event) => setMunicipality(event.detail.value ?? '')} interface="popover" required>
                    {municipalities.map((place) => <IonSelectOption key={place} value={place}>{place}</IonSelectOption>)}
                  </IonSelect>
                </IonItem>
                <IonItem className="login-field" lines="none">
                  <IonInput label="Password" labelPlacement="stacked" type="password" autocomplete="new-password" minlength={8} value={password} onIonInput={(event) => setPassword(event.detail.value ?? '')} required />
                </IonItem>
                <IonItem className="login-field" lines="none">
                  <IonInput label="Confirm password" labelPlacement="stacked" type="password" autocomplete="new-password" value={confirmPassword} onIonInput={(event) => setConfirmPassword(event.detail.value ?? '')} required />
                </IonItem>
                {(error || profileError) && <p className="login-error" role="alert">{error || profileError}</p>}
                {user && profileError && <IonButton fill="clear" color="medium" onClick={() => void signOutUser()}>Sign out</IonButton>}
                <IonButton className="login-submit" expand="block" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <IonSpinner name="dots" /> : 'Create farmer account'}
                </IonButton>
              </form>
              <p className="signup-staff-note">Staff accounts are created by SeedLink administrators.</p>
              <p className="login-help">Already registered? <Link to="/login">Sign in</Link></p>
            </div>
          </section>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Signup;