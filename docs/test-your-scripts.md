# Test Your Scripts

When you write your own scripts, you want to be able to test them. Especially because these scripts are responsible for deploying your code, you want to make sure they're reliable and not going to cause headaches for you and your team. 

Now, decaf will technically run your scripts in test mode when you open a pull request. Test mode can get you most of the way there with testing your scripts. However, just like any piece of code, there are edge cases that you need to make sure your scripts handle. Writing automated tests against your scripts is a great way to handle these edge cases where test mode might not be enough.

It's entirely up to you whether or not you want to write automated tests for your scripts. Consider it if your scripts are complex, if you're on a team, if you make changes often, or if you're writing scripts that others will use.

# Key things to test 

Treat script testing like writing unit tests for your codebase. Because decaf scripts can be written in any language, you will write your automated tests using any testing framework that you want. 

> Example code: Check out the `.test.ts` files in the `steps/` directory for automated tests written for the deployment scripts of this codebase. 

### Test Input/Output

Arguably the most important responsibility of a decaf script is to take in decaf input data and generate decaf output data. Therefore, a key strategy for testing your scripts is to run your scripts by passing in some pure decaf input data, and then asserting on the decaf output data that your script generates. 

The [decaf SDK](https://github.com/levibostian/decaf-sdk-deno/) (version 0.3.0+) provides testing functions to help you run your scripts in a test environment. For example, you can use `runDeployScript()`, `runGetLatestReleaseScript()`, or `runGetNextReleaseVersionScript()` to run your scripts with test input data and capture the output. Check out the `.test.ts` files in the `steps/` directory to see examples of how to use these testing functions. 

### Test Console Output 

decaf encourages you to make your scripts have human-readable logs printed to the console. Wouldn't it be great if your scripts could be used to onboard new engineers to your project? If your scripts have clear console output explaining the why and how of your deployment process, then new engineers can read those logs to learn the process! 

With this goal in mind, it's a good idea to run assertions on the console output that your scripts generate in each of the edge cases your tests cover. To learn how you could do this, check out the automated tests written in the `steps/*.test.ts` files.

### Updating the "Single Source of Truth" Only on Success

Your decaf deploy script is responsible for updating the "single source of truth" for the latest release of your project. You want to make sure that this "single source of truth" is only updated when your script runs successfully. If something goes wrong during the deployment process, you don't want to accidentally update the "single source of truth" to reflect a failed deployment. It's a good idea for your tests to check if the "single source of truth" is updated or not based on whether the script run was successful or not.

When writing automated tests for your scripts, make sure to cover this edge case by asserting that the "single source of truth" is only updated when the script runs successfully.

# Tools to help write tests 

### Run your decaf scripts 

In order to write automated tests for your decaf scripts, you need a way to run your scripts programmatically from your test code. The [decaf SDK](https://github.com/levibostian/decaf-sdk-deno/) provides official testing utilities starting with version 0.3.0. The SDK includes functions like `runDeployScript()`, `runGetLatestReleaseScript()`, and `runGetNextReleaseVersionScript()` that allow you to run your scripts with test input data and capture the output, exit code, and console output.

Check out the `.test.ts` files in the `steps/` directory of this project for examples of how to use these testing utilities in practice. While these examples are written in TypeScript/Deno, the SDK works with Deno, Node.js, and Bun, and the testing strategies can be adapted to any language and testing framework. 

### Mock Shell Commands

In order to write reliable automated tests for your scripts, you need a way to mock shell commands that your scripts run. This is important because you don't want your tests to actually run shell commands that modify your system or external services. Instead, you want to simulate the behavior of these shell commands in a controlled way.

Feel free to do this mocking in any way that makes sense for your stack. However, if it's helpful, here are a list of tools for you to consider:
- [mock-a-bin](https://github.com/levibostian/mock-a-bin) (Deno) and [mock-bin](https://github.com/stevemao/mock-bin) (Node.js): These tools allow you to mock shell commands in your scripts by modifying the `PATH` environment variable to point to mocked code that you write. This allows you to mock your scripts without any modifications to your script code! No dependency injection or anything! 