import { redirect } from "next/navigation";
import { Bookmark, ClipboardCheck, GraduationCap, LogOut, Route } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: assessments }, { data: saved }] = await Promise.all([
    supabase.from("student_profiles").select("highest_qualification, qualification_field, desired_occupation, preferred_states, migration_goal").eq("user_id", userId).maybeSingle(),
    supabase.from("assessments").select("id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("saved_courses").select("id").eq("user_id", userId),
  ]);

  return (
    <main className="dashboardPage">
      <header className="dashboardNav shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <form action="/auth/signout" method="post"><button className="back" type="submit"><LogOut size={16}/> Sign out</button></form>
      </header>

      <section className="dashboardHero shell">
        <p className="sectionLabel">MY UNIPATH</p>
        <h1>Your study planning dashboard</h1>
        <p className="muted">Keep your profile, assessments, shortlisted courses and future comparisons together.</p>
      </section>

      <section className="dashboardGrid shell">
        <article className="dashCard featured">
          <div className="dashIcon"><GraduationCap /></div><small>STUDENT PROFILE</small>
          <h2>{profile?.desired_occupation || "Build your study profile"}</h2>
          <p>{profile ? `${profile.highest_qualification || "Qualification not set"} · ${profile.qualification_field || "Study field not set"}` : "Complete the assessment to create your personalised profile."}</p>
          <a className="button" href="/assessment">{profile ? "Update assessment" : "Start assessment"}</a>
        </article>

        <article className="dashCard"><ClipboardCheck/><small>ASSESSMENTS</small><strong>{assessments?.length ?? 0}</strong><span>Recent assessments saved</span><a href="/assessment">Run a new assessment →</a></article>
        <article className="dashCard"><Bookmark/><small>SAVED COURSES</small><strong>{saved?.length ?? 0}</strong><span>Courses on your shortlist</span><a href="/results">View recommendations →</a></article>
        <article className="dashCard"><Route/><small>PATHWAY GOAL</small><strong className="textStrong">{profile?.migration_goal || "Not set"}</strong><span>Migration information remains educational and source-dated.</span></article>
      </section>

      <section className="recentPanel shell">
        <div><p className="sectionLabel">RECENT ACTIVITY</p><h2>Saved assessments</h2></div>
        {assessments?.length ? <div className="recentList">{assessments.map((item, index) => <a href="/results" key={item.id}><span>Assessment #{assessments.length - index}</span><small>{new Date(item.created_at).toLocaleDateString("en-AU")}</small></a>)}</div> : <div className="emptyState">No saved assessments yet. Your next completed assessment will appear here.</div>}
      </section>
    </main>
  );
}
