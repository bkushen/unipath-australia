import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, GraduationCap, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addApplication, deleteApplication, updateApplication } from "./actions";
import styles from "./applications.module.css";

export const dynamic = "force-dynamic";

type ApplicationRow = {
  id: string;
  status: string;
  application_reference: string | null;
  target_intake: string | null;
  deadline: string | null;
  notes: string | null;
  updated_at: string;
  courses: { id: string; name: string; universities: { name: string } | null } | null;
};
type SavedRow = { course_id: string; courses: { id: string; name: string; universities: { name: string } | null } | null };

const STATUS_OPTIONS = [
  ["considering", "Considering"], ["preparing", "Preparing application"], ["submitted", "Submitted"],
  ["offer_received", "Offer received"], ["accepted", "Accepted"], ["declined", "Declined"], ["withdrawn", "Withdrawn"],
] as const;

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login?next=/applications");

  const [{ data: applicationData }, { data: savedData }] = await Promise.all([
    supabase.from("student_applications").select("id,status,application_reference,target_intake,deadline,notes,updated_at,courses(id,name,universities(name))").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("saved_courses").select("course_id,courses(id,name,universities(name))").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  const applications = (applicationData ?? []) as unknown as ApplicationRow[];
  const saved = (savedData ?? []) as unknown as SavedRow[];
  const trackedIds = new Set(applications.map((item) => item.courses?.id).filter(Boolean));
  const available = saved.filter((item) => item.courses && !trackedIds.has(item.course_id));

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}><Link href="/" className="brand"><span>U</span> UniPath Australia</Link><Link href="/dashboard"><ArrowLeft size={15}/> Dashboard</Link></header>
      <section className={`${styles.hero} shell`}><div><p className="sectionLabel">APPLICATION TRACKER</p><h1>Move from shortlist to application.</h1><p>Track the practical status of courses you are considering. UniPath stores only your own records under Row Level Security.</p></div><div className={styles.heroStat}><ClipboardList size={20}/><span><b>{applications.length}</b>tracked applications</span></div></section>

      <section className={`${styles.addPanel} shell`}>
        <div><Plus size={17}/><span><b>Add from your saved courses</b><small>Save a course first if it is not listed here.</small></span></div>
        {available.length ? <form action={addApplication}><select name="course_id" required><option value="">Choose a saved course</option>{available.map((item) => <option key={item.course_id} value={item.course_id}>{item.courses?.name} — {item.courses?.universities?.name}</option>)}</select><button>Add to tracker</button></form> : <Link href="/courses">Browse and save courses →</Link>}
      </section>

      <section className={`${styles.list} shell`}>
        {applications.length ? applications.map((application) => <article key={application.id} className={styles.card}>
          <div className={styles.cardHead}><div><span>{application.courses?.universities?.name ?? "University"}</span><h2><Link href={`/courses/${application.courses?.id}`}>{application.courses?.name ?? "Course"}</Link></h2></div><StatusPill status={application.status}/></div>
          <form action={updateApplication} className={styles.form}>
            <input type="hidden" name="id" value={application.id}/>
            <label><span>Status</span><select name="status" defaultValue={application.status}>{STATUS_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Target intake</span><input name="target_intake" defaultValue={application.target_intake ?? ""} placeholder="e.g. February 2027"/></label>
            <label><span>Deadline</span><div className={styles.dateInput}><CalendarDays size={14}/><input type="date" name="deadline" defaultValue={application.deadline ?? ""}/></div></label>
            <label><span>Application reference</span><input name="application_reference" defaultValue={application.application_reference ?? ""} placeholder="Optional reference"/></label>
            <label className={styles.notes}><span>Notes</span><textarea name="notes" defaultValue={application.notes ?? ""} maxLength={1000} placeholder="Documents, follow-up notes, conditions, next action…"/></label>
            <button className={styles.save} type="submit">Save changes</button>
          </form>
          <footer><span>Updated {new Date(application.updated_at).toLocaleDateString("en-AU")}</span><form action={deleteApplication}><input type="hidden" name="id" value={application.id}/><button type="submit"><Trash2 size={13}/> Remove</button></form></footer>
        </article>) : <div className={styles.empty}><GraduationCap size={28}/><h2>No applications tracked yet</h2><p>Add one of your saved courses above when you are ready to move beyond comparison.</p><Link href="/courses">Explore courses</Link></div>}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: string }) { const label = STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status; return <span className={`${styles.status} ${styles[status] ?? ""}`}>{label}</span>; }
