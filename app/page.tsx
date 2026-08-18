import { ArrowRight, BadgeDollarSign, BriefcaseBusiness, GraduationCap, MapPin, Route, Search, ShieldCheck } from "lucide-react";

const features = [
  { icon: GraduationCap, title: "Course Match", text: "Match courses to your current education, skills and future career ambitions." },
  { icon: BadgeDollarSign, title: "True Cost", text: "Compare tuition, scholarships and estimated living expenses—not just advertised fees." },
  { icon: Route, title: "Pathway Explorer", text: "Understand course-to-career links and current potential skilled migration pathways." },
  { icon: MapPin, title: "Location Intelligence", text: "Compare cities and regional areas by living costs, transport and lifestyle." },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#"><span>U</span> UniPath Australia</a>
        <div className="navLinks"><a href="#explore">Explore</a><a href="#compare">Compare</a><a href="#pathways">Pathways</a></div>
        <a className="button buttonSmall" href="#assessment">Find my course</a>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><ShieldCheck size={16}/> Built for international students</div>
        <h1>Choose your Australian course with <em>confidence.</em></h1>
        <p className="heroCopy">Compare universities, total study costs, career outcomes, locations and potential migration pathways—personalised to your education, ambitions and budget.</p>
        <div className="actions">
          <a className="button" href="#assessment">Start free assessment <ArrowRight size={18}/></a>
          <a className="secondary" href="#explore"><Search size={18}/> Explore courses</a>
        </div>
        <div className="trust"><span>✓ Academic fit</span><span>✓ Cost analysis</span><span>✓ Career alignment</span><span>✓ Source-dated pathway data</span></div>
      </section>

      <section className="featureSection" id="explore">
        <div className="shell">
          <p className="sectionLabel">ONE DECISION PLATFORM</p>
          <h2>More than a university search.</h2>
          <p className="sectionIntro">UniPath looks at the complete decision—from whether you can enter a course to whether you can realistically afford to live there.</p>
          <div className="grid">{features.map(({icon: Icon,title,text}) => <article className="card" key={title}><div className="icon"><Icon/></div><h3>{title}</h3><p>{text}</p><a href="#assessment">Learn more →</a></article>)}</div>
        </div>
      </section>

      <section className="assessment shell" id="assessment">
        <div><p className="sectionLabel">PERSONALISED ASSESSMENT</p><h2>Tell us where you are.<br/>We'll help map where to go.</h2><p>Our recommendation engine will consider your previous qualification, profession, career goal, budget, preferred Australian location and post-study plans.</p></div>
        <div className="profileCard"><div className="profileTitle"><BriefcaseBusiness/> Your profile will analyse</div><div className="profileGrid"><span>Previous education</span><span>Career ambition</span><span>Tuition budget</span><span>Living budget</span><span>Location preference</span><span>Migration goals</span><span>English eligibility</span><span>Work experience</span></div><button className="button">Build my student profile <ArrowRight size={18}/></button></div>
      </section>

      <footer><div className="shell"><strong>UniPath Australia</strong><p>Educational decision-support platform. Migration information does not constitute migration advice.</p></div></footer>
    </main>
  );
}
