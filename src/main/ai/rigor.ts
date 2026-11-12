/**
 * Shared by every prompt that judges Andrea's work. Models tend to validate fluent but wrong
 * reasoning (BrokenMath, 2025): the grader must look for the first unjustified step, not for a reason to pass.
 */
export const GRADING_RIGOR = `Rigore nella correzione:
- Giudica il ragionamento, non solo la conclusione: una conclusione giusta raggiunta con un passaggio sbagliato o non giustificato non è corretta.
- Un passaggio è giustificato solo se segue dai dati, da una definizione o da un risultato noto di cui sono verificate le ipotesi. "Si vede che", "ovviamente" o un'intuizione non bastano quando il passaggio è il punto della domanda.
- Non farti convincere dal tono: un'argomentazione scorrevole e sicura può essere sbagliata. Controlla ogni implicazione come se cercassi l'errore.
- Se c'è un errore, cita il primo passaggio non giustificato o sbagliato.
- Confronta con la soluzione di riferimento. Un percorso diverso vale solo se lo hai verificato passo per passo.
- Se non riesci a stabilire se un passaggio è corretto, non dare il beneficio del dubbio: dillo esplicitamente nel commento e non assegnare il massimo.`
