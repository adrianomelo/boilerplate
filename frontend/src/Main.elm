module Main exposing (main)

import Browser
import Html exposing (Html, button, div, text)
import Html.Attributes exposing (style)
import Html.Events exposing (onClick)
import Http
import Json.Decode as D


type alias Flags =
    { apiUrl : String }


type alias Model =
    { count : Int
    , apiMessage : Maybe String
    , error : Maybe String
    , apiUrl : String
    }


initialModel : String -> Model
initialModel apiUrl =
    { count = 0
    , apiMessage = Nothing
    , error = Nothing
    , apiUrl = apiUrl
    }


type Msg
    = Increment
    | Decrement
    | GetGreeting
    | ApiResponse (Result Http.Error String)


getGreeting : String -> Cmd Msg
getGreeting apiUrl =
    Http.get
        { url = apiUrl ++ "/greet?person=Developer"
        , expect = Http.expectJson ApiResponse (D.field "message" D.string)
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Increment ->
            ( { model | count = model.count + 1 }, Cmd.none )

        Decrement ->
            ( { model | count = model.count - 1 }, Cmd.none )

        GetGreeting ->
            ( { model | apiMessage = Nothing, error = Nothing }
            , getGreeting model.apiUrl
            )

        ApiResponse (Ok message) ->
            ( { model | apiMessage = Just message }, Cmd.none )

        ApiResponse (Err _) ->
            ( { model | error = Just "Failed to fetch greeting" }, Cmd.none )


view : Model -> Html Msg
view model =
    div []
        [ div []
            [ button [ onClick Decrement ] [ text "-" ]
            , div [] [ text (String.fromInt model.count) ]
            , button [ onClick Increment ] [ text "+" ]
            ]
        , div []
            [ button [ onClick GetGreeting ] [ text "Get Greeting" ]
            , case model.apiMessage of
                Just msg -> 
                    div [] [ text ("API says: " ++ msg) ]
                Nothing -> 
                    text ""
            , case model.error of
                Just err -> 
                    div [ style "color" "red" ] [ text err ]
                Nothing -> 
                    text ""
            ]
        ]


main : Program Flags Model Msg
main =
    Browser.element
        { init = \flags -> ( initialModel flags.apiUrl, Cmd.none )
        , view = view
        , update = update
        , subscriptions = \_ -> Sub.none
        } 