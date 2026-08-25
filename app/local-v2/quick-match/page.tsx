import QuickMatchPageClient from "@/components/local-v2/QuickMatchPageClient";
import styles from "./quick-match.module.css";

export default function QuickMatchPage() {
  return (
    <div className={styles.pageShell} id="quick-match-content">
      <a className={styles.skipLink} href="#quick-match-content">
        Skip to Quick Match
      </a>
      <QuickMatchPageClient />
    </div>
  );
}
