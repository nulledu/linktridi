# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.dashvendas.tv.data.** {
    *** Companion;
}
-keepclasseswithmembers class com.dashvendas.tv.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
