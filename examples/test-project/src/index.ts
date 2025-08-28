// Main entry point
export function main() {
  console.log("Hello from main!");
}

// This function is exported but never used
export function unusedFunction() {
  console.log("This function is never called");
}

// This variable is exported but never used
export const unusedVariable = "This variable is never used";

// This function is not exported and never used
function privateUnusedFunction() {
  console.log("This private function is never called");
}

// This class is not exported and never used
class UnusedClass {
  constructor() {
    console.log("This class is never instantiated");
  }
  
  unusedMethod() {
    console.log("This method is never called");
  }
}

// This is used, so it should not be removed
const usedVariable = "This variable is used";
console.log(usedVariable);

// Call the main function
main();
