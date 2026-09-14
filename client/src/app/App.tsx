import { AuthPanel } from "../features/auth/AuthPanel";
import { ProductList } from "../features/products/ProductList";
import styles from "./App.module.css";

function App() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <AuthPanel />
        </aside>
        <ProductList />
      </div>
    </main>
  );
}

export default App;
