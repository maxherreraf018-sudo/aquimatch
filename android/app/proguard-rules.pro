# Reglas de R8 para el build de release.
#
# R8 achica la app borrando el código que no ve usado y renombrando el resto.
# El problema es que "no lo ve usado" y "no se usa" no son lo mismo: lo que se
# llama por reflexión —los plugins de Capacitor, que el puente JavaScript busca
# por nombre— parece muerto y se borra. Y eso no se nota al compilar, solo al
# ejecutar en el teléfono.
#
# La mayor parte ya viene resuelta sin que hagamos nada: @capacitor/android y
# @capgo/capacitor-social-login traen sus propias reglas (consumerProguardFiles)
# y se aplican solas. Cubren los plugins, el login con Google y con Apple,
# OkHttp y las credenciales. Acá va solo lo que falta.

# Que las fallas se puedan leer.
#
# Sin esto, un reporte de Crashlytics o de Play llega con los nombres
# destrozados y no sirve para nada. Con esto y el archivo mapping.txt subido a
# Play, las fallas se leen igual que antes. El mapping.txt de cada versión
# queda en android/app/build/outputs/mapping/release/ y HAY QUE SUBIRLO en la
# misma versión de Play, porque es el único que la traduce.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Los nombres de las excepciones, que Crashlytics necesita para agrupar fallas
# distintas en vez de mezclarlas todas.
-keepattributes Signature,*Annotation*,Exceptions,InnerClasses,EnclosingMethod

# Firebase avisa de clases opcionales que no incluimos (proveedores de
# autenticación que no usamos, por ejemplo). No es un problema: son advertencias
# de algo que la app nunca va a llamar.
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
