
// This service has been deprecated as the AI dependency was removed.
// Keeping file structure to prevent import errors if referenced elsewhere, 
// but functionalities are now no-ops.

export const generateProblem = async (topic: string): Promise<{ latex: string; description: string }> => {
    return {
      latex: '\\text{AI generation disabled}',
      description: 'System'
    };
};

export const explainLatex = async (latex: string): Promise<string> => {
    return "AI features are currently disabled.";
}
