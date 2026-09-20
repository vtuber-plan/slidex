using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
var failed = false;
foreach (var file in args) {
    using var document = PresentationDocument.Open(file, false);
    var errors = new OpenXmlValidator().Validate(document).ToList();
    Console.WriteLine($"{file}: {errors.Count} OOXML errors");
    foreach (var error in errors.Take(30)) Console.WriteLine($"{error.Part?.Uri} {error.Path?.XPath}: {error.Description}");
    failed |= errors.Count > 0;
}
return failed ? 1 : 0;
