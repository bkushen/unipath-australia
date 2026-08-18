import { GraduationCap, LockKeyhole, Mail } from "lucide-react";
import { login, signup } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const query = await searchParams;
  const next = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/dashboard";

  return (
    <main className="authPage">
      <section className="authCard">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <div className="authIcon"><GraduationCap /></div>
        <p className="sectionLabel">STUDENT ACCOUNT</p>
        <h1>Save your study journey.</h1>
        <p className="muted">Create an account to keep assessments, saved courses and comparisons available across devices.</p>

        {query.error && <div className="authAlert error">{query.error}</div>}
        {query.message && <div className="authAlert success">{query.message}</div>}

        <form className="authForm">
          <input type="hidden" name="next" value={next} />
          <label><span><Mail size={16}/> Email</span><input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label><span><LockKeyhole size={16}/> Password</span><input name="password" type="password" minLength={8} autoComplete="current-password" required placeholder="At least 8 characters" /></label>
          <div className="authActions">
            <button className="button" formAction={login}>Log in</button>
            <button className="secondary" formAction={signup}>Create account</button>
          </div>
        </form>
        <p className="authFoot">You can explore UniPath without an account. Signing in is only required to save your progress.</p>
      </section>
    </main>
  );
}
